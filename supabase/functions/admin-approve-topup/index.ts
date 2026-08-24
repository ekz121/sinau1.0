import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { supabaseAdmin, getAuthUser, errorResponse, successResponse } from '../_shared/supabaseAdmin.ts'

// @ts-ignore
declare const Deno: { env: { get(key: string): string | undefined } }

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const user = await getAuthUser(req)

    // Cek admin via DB (bukan JWT claim saja)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, is_suspended')
      .eq('id', user.id)
      .single()
    if (!profile) return errorResponse('Profile not found', 404)
    if (profile.is_suspended) return errorResponse('Account suspended', 403)
    if (profile.role !== 'admin') return errorResponse('Admin access required', 403)

    const { request_id, action, admin_note } = await req.json()
    if (!request_id) return errorResponse('request_id is required')
    if (!['selesai', 'ditolak'].includes(action)) return errorResponse('action must be selesai or ditolak')

    // Fetch request — lock via status check untuk idempotency
    const { data: req_data, error: reqErr } = await supabaseAdmin
      .from('topup_requests')
      .select('*')
      .eq('id', request_id)
      .single()

    if (reqErr || !req_data) return errorResponse('Request not found', 404)

    // Idempotency: jika sudah diproses, return sukses tanpa apply lagi
    if (req_data.status !== 'pending') {
      return successResponse({
        success: true,
        already_processed: true,
        current_status: req_data.status,
      })
    }

    if (action === 'selesai') {
      // Tambah saldo via RPC atomik — kirim idempotency_key untuk proteksi ganda
      const { error: topupErr } = await supabaseAdmin.rpc('process_topup', {
        p_user_id: req_data.user_id,
        p_amount: req_data.jumlah_koin,
        p_idempotency_key: request_id, // gunakan request_id sebagai idempotency key
      })
      if (topupErr) return errorResponse(topupErr.message, 500)
    }

    // Update status request
    const { error: updateErr } = await supabaseAdmin
      .from('topup_requests')
      .update({
        status: action,
        admin_note: admin_note || null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', request_id)
      // Extra guard: hanya update jika masih pending (race condition protection)
      .eq('status', 'pending')

    if (updateErr) return errorResponse(updateErr.message, 500)

    // Kirim notifikasi ke user (side-effect — kegagalan tidak gagalkan request)
    try {
      const notifType = action === 'selesai' ? 'topup_approved' : 'topup_rejected'
      await supabaseAdmin.from('notifications').insert({
        user_id: req_data.user_id,
        type: notifType,
        payload_json: {
          jumlah_koin: req_data.jumlah_koin,
          admin_note: admin_note || null,
        },
      })
    } catch (notifErr) {
      console.error('[approve-topup] Failed to insert notification:', notifErr)
    }

    // Audit log
    try {
      await supabaseAdmin.from('admin_audit_log').insert({
        admin_id: user.id,
        action: action === 'selesai' ? 'approve_topup' : 'reject_topup',
        target_type: 'topup_request',
        target_id: request_id,
        note: admin_note || null,
      })
    } catch (auditErr) {
      console.error('[approve-topup] Failed to write audit log:', auditErr)
    }

    return successResponse({ success: true, already_processed: false })
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
