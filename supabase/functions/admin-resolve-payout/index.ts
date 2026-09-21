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

    const { payout_id, action, admin_note } = await req.json()
    if (!payout_id) return errorResponse('payout_id is required')
    if (!['selesai', 'ditolak'].includes(action))
      return errorResponse('action must be selesai or ditolak')
    if (admin_note && (typeof admin_note !== 'string' || admin_note.length > 500))
      return errorResponse('admin_note tidak valid')

    const { data: result, error } = await supabaseAdmin.rpc('resolve_payout', {
      p_payout_id: payout_id,
      p_action: action,
      p_note: admin_note || null,
    })
    if (error) {
      const status = error.message?.includes('not found') ? 404 : 500
      return errorResponse(error.message, status)
    }
    if (result?.already_processed) return successResponse(result)

    const notifType = action === 'selesai' ? 'payout_approved' : 'payout_rejected'
    const { error: notifError } = await supabaseAdmin.from('notifications').insert({
      user_id: result.creator_id,
      type: notifType,
      payload_json: { jumlah_koin: result.jumlah_koin, admin_note: admin_note || null },
    })
    if (notifError) console.error('[resolve-payout] notification:', notifError.message)

    const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: user.id,
      action: action === 'selesai' ? 'approve_payout' : 'reject_payout',
      target_type: 'payout_request',
      target_id: payout_id,
      note: admin_note || null,
    })
    if (auditError) console.error('[resolve-payout] audit:', auditError.message)

    return successResponse(result)
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
