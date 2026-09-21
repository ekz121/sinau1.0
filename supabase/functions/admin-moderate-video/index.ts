import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { supabaseAdmin, getAuthUser, errorResponse, successResponse } from '../_shared/supabaseAdmin.ts'

declare const Deno: { env: { get(key: string): string | undefined } }
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

function storagePath(value: string | null, bucket: string) {
  if (!value) return null
  let path = value.trim()
  if (/^https?:\/\//.test(path)) {
    const marker = `/storage/v1/object/public/${bucket}/`
    const privateMarker = `/storage/v1/object/${bucket}/`
    if (path.includes(marker)) path = path.split(marker)[1]
    else if (path.includes(privateMarker)) path = path.split(privateMarker)[1]
    else return null
  }
  path = decodeURIComponent(path).split('?')[0].replace(new RegExp(`^${bucket}/`), '')
  return path.includes('..') ? null : path
}

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const user = await getAuthUser(req)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, is_suspended, is_deleted')
      .eq('id', user.id)
      .single()
    if (profileError || !profile) return errorResponse('Profile not found', 404)
    if (profile.role !== 'admin' || profile.is_suspended || profile.is_deleted)
      return errorResponse('Admin access required', 403)

    const body = await req.json()
    const { video_id, action, rejection_note, metadata } = body
    if (!video_id) return errorResponse('video_id is required')
    if (!['approve', 'reject', 'edit', 'delete'].includes(action))
      return errorResponse('Invalid action')
    if (action === 'reject' && !rejection_note?.trim())
      return errorResponse('rejection_note is required when rejecting')

    const { data: current, error: videoError } = await supabaseAdmin
      .from('videos')
      .select('id, creator_id, judul, video_file_url, thumbnail_url, is_deleted')
      .eq('id', video_id)
      .single()
    if (videoError || !current) return errorResponse('Video not found', 404)

    let updatePayload: Record<string, unknown> = {}
    if (action === 'approve') updatePayload = { status: 'approved', rejection_note: null }
    if (action === 'reject') updatePayload = { status: 'rejected', rejection_note: rejection_note.trim().slice(0, 500) }
    if (action === 'edit') {
      const title = metadata?.judul?.trim()
      const category = metadata?.kategori?.trim()
      const description = metadata?.deskripsi?.trim() || null
      if (!title || title.length > 100) return errorResponse('Judul wajib diisi dan maksimal 100 karakter')
      if (!category || category.length > 100) return errorResponse('Kategori wajib diisi')
      if (description && description.length > 5000) return errorResponse('Deskripsi maksimal 5000 karakter')
      updatePayload = { judul: title, kategori: category, deskripsi: description, harga_koin: 1 }
    }
    if (action === 'delete') {
      const videoPath = storagePath(current.video_file_url, 'videos')
      if (videoPath) {
        const { error } = await supabaseAdmin.storage.from('videos').remove([videoPath])
        if (error) return errorResponse(`Gagal menghapus file video: ${error.message}`, 500)
      }
      const thumbnailPath = storagePath(current.thumbnail_url, 'thumbnails')
      if (thumbnailPath) {
        const { error } = await supabaseAdmin.storage.from('thumbnails').remove([thumbnailPath])
        if (error) console.error('[admin-video] thumbnail cleanup:', error.message)
      }
      updatePayload = { is_deleted: true, video_file_url: null, thumbnail_url: null }
    }

    const { error: updateError } = await supabaseAdmin
      .from('videos')
      .update(updatePayload)
      .eq('id', video_id)
    if (updateError) return errorResponse(`Failed to update video: ${updateError.message}`, 500)

    const auditAction = {
      approve: 'approve_video',
      reject: 'reject_video',
      edit: 'edit_video',
      delete: 'delete_video',
    }[action]
    const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: user.id,
      action: auditAction,
      target_type: 'video',
      target_id: video_id,
      note: action === 'reject' ? rejection_note.trim() : null,
    })
    if (auditError) console.error('[admin-video] audit:', auditError.message)

    if (action === 'approve') {
      const projectUrl = Deno.env.get('SUPABASE_URL')
      const authorization = req.headers.get('Authorization')
      if (projectUrl && authorization) {
        const quizTask = fetch(`${projectUrl}/functions/v1/generate-quiz`, {
          method: 'POST',
          headers: { Authorization: authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_id }),
        }).then(async (response) => {
          if (!response.ok) console.error('[admin-video] quiz generation:', await response.text())
        }).catch((error) => console.error('[admin-video] quiz generation:', error.message))
        EdgeRuntime.waitUntil(quizTask)
      }
    }

    return successResponse({ success: true, video_id, action })
  } catch (err: unknown) {
    const error = err as Error
    const status = error.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
