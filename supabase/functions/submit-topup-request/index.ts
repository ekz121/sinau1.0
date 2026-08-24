import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { supabaseAdmin, getAuthUser, checkNotSuspended, errorResponse, successResponse } from '../_shared/supabaseAdmin.ts'

// @ts-ignore
declare const Deno: { env: { get(key: string): string | undefined } }

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const user = await getAuthUser(req)
    await checkNotSuspended(user.id)

    const { jumlah_koin, bukti_transfer_url, idempotency_key } = await req.json()
    if (!jumlah_koin || typeof jumlah_koin !== 'number' || jumlah_koin <= 0)
      return errorResponse('jumlah_koin harus berupa angka positif')

    // Baca koin_to_rupiah_rate dari app_settings (tidak hardcode 500)
    const { data: rateData } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'koin_to_rupiah_rate')
      .single()
    const koinRate = parseInt(rateData?.value ?? '500') || 500

    // Validasi nominal: harus positif (tidak hardcode pilihan nominal)
    if (jumlah_koin > 10000) return errorResponse('Jumlah koin melebihi batas maksimum')

    // Idempotency check: cegah double-submit dengan key yang sama
    if (idempotency_key) {
      const { data: existing } = await supabaseAdmin
        .from('topup_requests')
        .select('id, status')
        .eq('idempotency_key', idempotency_key)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existing) {
        // Request sudah ada — return sukses tanpa insert baru (idempoten)
        return successResponse({ success: true, already_submitted: true, request_id: existing.id })
      }
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('topup_requests')
      .insert({
        user_id: user.id,
        jumlah_koin,
        jumlah_rupiah: jumlah_koin * koinRate,
        bukti_transfer_url: bukti_transfer_url || null,
        status: 'pending',
        idempotency_key: idempotency_key || null,
      })
      .select('id')
      .single()

    if (error) return errorResponse(error.message, 500)
    return successResponse({ success: true, already_submitted: false, request_id: inserted?.id })
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message === 'Account suspended' ? 403 : e.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
