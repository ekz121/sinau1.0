import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { supabaseAdmin, getAuthUser, errorResponse, successResponse } from '../_shared/supabaseAdmin.ts'

// @ts-ignore
declare const Deno: { env: { get(key: string): string | undefined } }

/**
 * admin-manage-user: Aksi admin terhadap akun user.
 * Supported actions:
 *   - suspend:   set is_suspended = true
 *   - unsuspend: set is_suspended = false
 *   - soft_delete: set is_deleted = true
 *   - promote_admin:   set role = 'admin'
 *   - demote_admin:    set role = 'mahasiswa'
 *
 * Keamanan:
 *   - Hanya admin yang bisa mengakses
 *   - Admin tidak bisa memodifikasi akun admin lain (kecuali demote)
 *   - Admin tidak bisa memodifikasi dirinya sendiri
 *   - Semua operasi menggunakan service_role (bypass RLS)
 */
Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const adminUser = await getAuthUser(req)

    // Verifikasi admin via DB
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, is_suspended')
      .eq('id', adminUser.id)
      .single()

    if (!adminProfile) return errorResponse('Profile not found', 404)
    if (adminProfile.is_suspended) return errorResponse('Account suspended', 403)
    if (adminProfile.role !== 'admin') return errorResponse('Admin access required', 403)

    const { target_user_id, action } = await req.json()
    if (!target_user_id) return errorResponse('target_user_id is required')
    if (!action) return errorResponse('action is required')

    const VALID_ACTIONS = ['suspend', 'unsuspend', 'soft_delete', 'promote_admin', 'demote_admin']
    if (!VALID_ACTIONS.includes(action)) {
      return errorResponse(`action harus salah satu: ${VALID_ACTIONS.join(', ')}`)
    }

    // Admin tidak bisa mengubah dirinya sendiri
    if (target_user_id === adminUser.id) {
      return errorResponse('Admin tidak bisa memodifikasi akun sendiri')
    }

    // Fetch target user
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_suspended, is_deleted')
      .eq('id', target_user_id)
      .single()

    if (!targetProfile) return errorResponse('User tidak ditemukan', 404)

    // Guard: tidak bisa suspend/delete admin lain (hanya promote/demote yang boleh)
    if (targetProfile.role === 'admin' && !['promote_admin', 'demote_admin'].includes(action)) {
      return errorResponse('Tidak bisa memodifikasi akun admin lain')
    }

    let updatePayload: Record<string, unknown> = {}

    switch (action) {
      case 'suspend':
        updatePayload = { is_suspended: true }
        break
      case 'unsuspend':
        updatePayload = { is_suspended: false }
        break
      case 'soft_delete':
        // Soft delete: suspend + is_deleted = true
        updatePayload = { is_deleted: true, is_suspended: true }
        break
      case 'promote_admin':
        updatePayload = { role: 'admin' }
        break
      case 'demote_admin':
        updatePayload = { role: 'mahasiswa' }
        break
    }

    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', target_user_id)

    if (updateErr) return errorResponse(updateErr.message, 500)

    // Audit log
    try {
      await supabaseAdmin.from('admin_audit_log').insert({
        admin_id: adminUser.id,
        action,
        target_type: 'user',
        target_id: target_user_id,
      })
    } catch (auditErr) {
      console.error('[admin-manage-user] Failed to write audit log:', auditErr)
    }

    return successResponse({ success: true, action, target_user_id })
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
