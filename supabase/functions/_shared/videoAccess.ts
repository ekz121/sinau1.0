import { supabaseAdmin } from './supabaseAdmin.ts'

export async function requireFullVideoAccess(userId: string, videoId: string) {
  const { data: video, error } = await supabaseAdmin
    .from('videos')
    .select('id, creator_id, video_file_url, deskripsi, judul, kategori, status, durasi_detik, is_deleted')
    .eq('id', videoId)
    .single()
  if (error || !video || video.is_deleted) throw new Error('Video not found')

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', userId).single()
  const privileged = video.creator_id === userId || profile?.role === 'admin'
  if (video.status !== 'approved' && !privileged) throw new Error('Video belum disetujui')

  if (!privileged && Number(video.durasi_detik || 0) > 60) {
    const { data: view } = await supabaseAdmin
      .from('views')
      .select('has_paid_to_continue')
      .eq('video_id', videoId)
      .eq('viewer_id', userId)
      .maybeSingle()
    if (!view?.has_paid_to_continue) throw new Error('Full video access required')
  }
  return video
}
