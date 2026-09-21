import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  supabaseAdmin,
  getAuthUser,
  checkNotSuspended,
  errorResponse,
  successResponse,
} from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    // 1. Authenticate
    const user = await getAuthUser(req)

    // 2. Check suspension
    await checkNotSuspended(user.id)

    // 3. Parse body
    const { video_id } = await req.json()
    if (!video_id) return errorResponse('video_id is required')

    // 4. Fetch video + viewer's payment status in one query
    const { data: video, error: vidErr } = await supabaseAdmin
      .from('videos')
      .select('id, creator_id, video_file_url, durasi_detik, status, harga_koin, is_deleted')
      .eq('id', video_id)
      .single()

    if (vidErr || !video) return errorResponse('Video not found', 404)
    if (video.is_deleted) return errorResponse('Video not found', 404)
    if (!video.video_file_url) return errorResponse('Video file not available', 404)

    // 5. Resolve access level
    const isCreator = video.creator_id === user.id

    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const isAdmin = requesterProfile?.role === 'admin'

    // Non-creator/non-admin must have approved status
    if (!isCreator && !isAdmin && video.status !== 'approved') {
      return errorResponse('Video is not approved', 403)
    }

    // Record one unique view through a service-only RPC. The database trigger
    // awards exactly one blue coin to the creator for this viewer/video pair.
    if (!isCreator && !isAdmin && video.status === 'approved') {
      const { error: viewError } = await supabaseAdmin.rpc('record_video_view', {
        p_viewer_id: user.id,
        p_video_id: video_id,
      })
      if (viewError) return errorResponse('Failed to record video view', 500)
    }

    // 6. Check paywall access for non-creator/non-admin
    //    If the video has a price, verify the viewer has paid
    let hasPaidAccess = isCreator || isAdmin || (video.harga_koin === 0)

    if (!hasPaidAccess) {
      const { data: viewRecord } = await supabaseAdmin
        .from('views')
        .select('has_paid_to_continue')
        .eq('video_id', video_id)
        .eq('viewer_id', user.id)
        .maybeSingle()

      hasPaidAccess = viewRecord?.has_paid_to_continue === true
    }

    // 7. Sanitize video_file_url to relative storage path inside 'videos' bucket
    let cleanPath = video.video_file_url.trim()
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      if (!cleanPath.includes('/storage/v1/object/'))
        return errorResponse('Invalid video storage path', 500)
      const parts = cleanPath.split('/storage/v1/object/')
      if (parts.length > 1) {
        const pathParts = parts[1].split('/')
        if (pathParts.length > 2 && pathParts[1] === 'videos') {
          cleanPath = pathParts.slice(2).join('/')
        } else {
          cleanPath = pathParts.slice(1).join('/')
        }
      }
    }
    if (cleanPath.startsWith('videos/')) {
      cleanPath = cleanPath.replace(/^videos\//, '')
    }
    cleanPath = decodeURIComponent(cleanPath).split('?')[0]
    if (cleanPath.includes('..') || !cleanPath.startsWith(`${video.creator_id}/`))
      return errorResponse('Invalid video storage path', 500)

    // 8. Generate signed URL
    //    - Full access (creator/admin/paid): TTL = video duration + 5min buffer (min 10min)
    //    - Free preview access: TTL = free_preview_seconds + 2min buffer (min 5min)
    let ttlSeconds: number

    if (hasPaidAccess) {
      ttlSeconds = Math.max(600, (video.durasi_detik ?? 0) + 300)
    } else {
      // Free preview: read from app_settings
      const { data: previewData } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'free_preview_seconds')
        .single()
      const previewSeconds = parseInt(previewData?.value ?? '60') || 60
      ttlSeconds = Math.max(180, previewSeconds + 120)
    }

    const { data: signedData, error: signErr } = await supabaseAdmin
      .storage
      .from('videos')
      .createSignedUrl(cleanPath, ttlSeconds)

    if (signErr || !signedData?.signedUrl) {
      return errorResponse('Failed to generate signed URL: ' + signErr?.message, 500)
    }

    return successResponse({
      signed_url: signedData.signedUrl,
      ttl: ttlSeconds,
      has_paid_access: hasPaidAccess,
    })
  } catch (err) {
    const e = err as Error
    const status = e.message === 'Account suspended' ? 403
      : e.message?.includes('token') ? 401
      : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
