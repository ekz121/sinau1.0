import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { supabaseAdmin, getAuthUser, errorResponse, successResponse } from '../_shared/supabaseAdmin.ts'

// @ts-ignore
declare const Deno: { env: { get(key: string): string | undefined } }

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const user = await getAuthUser(req)

    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return errorResponse('Admin access required', 403)

    const { payout_id, action, admin_note } = await req.json()
    if (!payout_id) return errorResponse('payout_id is required')
    if (!['selesai', 'ditolak'].includes(action)) return errorResponse('action must be selesai or ditolak')

    const { data: payoutData, error } = await supabaseAdmin.rpc('resolve_payout', {
      p_payout_id: payout_id,
      p_action: action,
      p_note: admin_note || null,
    })

    if (error) return errorResponse(error.message, 500)

    // Send notification (side-effect — failure must NOT fail the whole request)
    try {
      const { data: payoutRow } = await supabaseAdmin
        .from('payout_requests')
        .select('creator_id, jumlah_koin')
        .eq('id', payout_id)
        .single()
      if (payoutRow) {
        const notifType = action === 'selesai' ? 'payout_approved' : 'payout_rejected'
        await supabaseAdmin.from('notifications').insert({
          user_id: payoutRow.creator_id,
          type: notifType,
          payload_json: { jumlah_koin: payoutRow.jumlah_koin, admin_note: admin_note || null },
        })
      }
    } catch (notifErr) {
      console.error('[resolve-payout] Failed to insert notification:', notifErr)
    }

    // Audit log
    try {
      await supabaseAdmin.from('admin_audit_log').insert({
        admin_id: user.id,
        action: action === 'selesai' ? 'approve_payout' : 'reject_payout',
        target_type: 'payout_request',
        target_id: payout_id,
        note: admin_note || null,
      })
    } catch (auditErr) {
      console.error('[resolve-payout] Failed to write audit log:', auditErr)
    }

    return successResponse(payoutData)
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
