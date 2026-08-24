import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  supabaseAdmin,
  getAuthUser,
  errorResponse,
  successResponse,
} from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    // 1. Authenticate
    const user = await getAuthUser(req)

    // 2. Check admin role from DB (not just JWT)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role, is_suspended')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile) return errorResponse('Profile not found', 404)
    if (profile.is_suspended) return errorResponse('Account suspended', 403)
    if (profile.role !== 'admin') return errorResponse('Admin access required', 403)

    // 3. Parse body
    const { video_id, action, rejection_note } = await req.json()
    if (!video_id) return errorResponse('video_id is required')
    if (!['approve', 'reject'].includes(action)) return errorResponse('action must be approve or reject')
    if (action === 'reject' && !rejection_note?.trim()) {
      return errorResponse('rejection_note is required when rejecting')
    }

    // 4. Update video status
    const updatePayload: Record<string, string> = { status: action === 'approve' ? 'approved' : 'rejected' }
    if (action === 'reject') updatePayload.rejection_note = rejection_note.trim()

    const { data: videoData, error: updateErr } = await supabaseAdmin
      .from('videos')
      .update(updatePayload)
      .eq('id', video_id)
      .select('creator_id')
      .single()

    if (updateErr) return errorResponse('Failed to update video: ' + updateErr.message, 500)

    // 5. Send notification (side-effect)
    try {
      const notifType = action === 'approve' ? 'video_approved' : 'video_rejected'
      const notifPayload = action === 'reject' ? { video_id, rejection_note: rejection_note.trim() } : { video_id }
      await supabaseAdmin.from('notifications').insert({
        user_id: videoData.creator_id,
        type: notifType,
        payload_json: notifPayload,
      })
    } catch (notifErr) {
      console.error('[moderate-video] Failed to insert notification:', notifErr)
    }

    // 6. Audit log
    try {
      await supabaseAdmin.from('admin_audit_log').insert({
        admin_id: user.id,
        action: action === 'approve' ? 'approve_video' : 'reject_video',
        target_type: 'video',
        target_id: video_id,
        note: rejection_note?.trim() || null,
      })
    } catch (auditErr) {
      console.error('[moderate-video] Failed to write audit log:', auditErr)
    }

    // 7. Trigger generate-quiz otomatis setelah approve (async, tidak block response)
    if (action === 'approve') {
      // Tandai di queue — worker/admin bisa proses async
      supabaseAdmin
        .from('quiz_generation_queue')
        .upsert({ video_id, status: 'pending' }, { onConflict: 'video_id' })
        .then(() => {})
        .catch((e: Error) => console.error('[moderate-video] Failed to queue quiz:', e.message))
    }

    return successResponse({ success: true, video_id, action })
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
