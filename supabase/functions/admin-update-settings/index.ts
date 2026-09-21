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

    const { settings } = await req.json()
    if (!settings || typeof settings !== 'object') return errorResponse('settings is required')

    const rows: Array<{ key: string; value: string }> = []
    if (settings.revenue_split_creator !== undefined) {
      const creator = Number(settings.revenue_split_creator)
      if (!Number.isInteger(creator) || creator < 1 || creator > 99)
        return errorResponse('Revenue kreator harus 1-99 persen')
      rows.push({ key: 'revenue_split_creator', value: String(creator) })
      rows.push({ key: 'revenue_split_platform', value: String(100 - creator) })
    }
    if (settings.min_payout_koin !== undefined) {
      const minimum = Number(settings.min_payout_koin)
      if (!Number.isInteger(minimum) || minimum < 1 || minimum > 100000)
        return errorResponse('Minimum pencairan tidak valid')
      rows.push({ key: 'min_payout_koin', value: String(minimum) })
    }
    if (settings.qris_image_url !== undefined) {
      const value = String(settings.qris_image_url).trim()
      if (value && (!value.startsWith('https://') || value.length > 2000))
        return errorResponse('URL QRIS harus HTTPS')
      rows.push({ key: 'qris_image_url', value })
    }
    if (rows.length === 0) return errorResponse('Tidak ada pengaturan yang dapat diperbarui')

    // Fixed business rules are always restored server-side.
    rows.push(
      { key: 'koin_to_rupiah_rate', value: '500' },
      { key: 'paywall_coin', value: '1' },
      { key: 'free_preview_seconds', value: '60' },
    )
    const { error } = await supabaseAdmin.from('app_settings').upsert(rows)
    if (error) return errorResponse(error.message, 500)

    const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: user.id,
      action: 'update_settings',
      target_type: 'settings',
      target_id: rows.map((row) => row.key).join(','),
    })
    if (auditError) console.error('[settings] audit:', auditError.message)
    return successResponse({ success: true, keys: rows.map((row) => row.key) })
  } catch (err: unknown) {
    const error = err as Error
    const status = error.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: error.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
