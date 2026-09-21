import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { supabaseAdmin, getAuthUser, errorResponse, successResponse } from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes
  try {
    const user = await getAuthUser(req)
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role, is_suspended, is_deleted').eq('id', user.id).single()
    if (profile?.role !== 'admin' || profile.is_suspended || profile.is_deleted)
      return errorResponse('Admin access required', 403)

    const { report_id, action } = await req.json()
    if (!report_id) return errorResponse('report_id is required')
    if (!['process', 'resolve', 'dismiss', 'delete_comment'].includes(action))
      return errorResponse('Invalid action')

    const { data: report, error: reportError } = await supabaseAdmin
      .from('reports').select('id, comment_id, video_id, status').eq('id', report_id).single()
    if (reportError || !report) return errorResponse('Report not found', 404)

    if (action === 'delete_comment') {
      if (!report.comment_id) return errorResponse('Report does not target a comment')
      const { error } = await supabaseAdmin
        .from('comments')
        .update({ is_deleted: true, content: '[Komentar dihapus]' })
        .eq('id', report.comment_id)
      if (error) return errorResponse(error.message, 500)
    }

    const status = action === 'process' ? 'diproses'
      : action === 'dismiss' ? 'ditolak'
      : 'selesai'
    const { error: updateError } = await supabaseAdmin
      .from('reports').update({ status }).eq('id', report_id)
    if (updateError) return errorResponse(updateError.message, 500)

    const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: user.id,
      action: `report_${action}`,
      target_type: 'report',
      target_id: report_id,
    })
    if (auditError) console.error('[resolve-report] audit:', auditError.message)
    return successResponse({ success: true, report_id, status })
  } catch (err: unknown) {
    const error = err as Error
    const status = error.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: error.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
