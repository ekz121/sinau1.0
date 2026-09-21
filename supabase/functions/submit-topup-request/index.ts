import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { supabaseAdmin, getAuthUser, checkNotSuspended, errorResponse, successResponse } from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const user = await getAuthUser(req)
    await checkNotSuspended(user.id)
    const { jumlah_koin, bukti_transfer_url, idempotency_key } = await req.json()

    if (!Number.isInteger(jumlah_koin) || jumlah_koin <= 0)
      return errorResponse('jumlah_koin harus berupa bilangan bulat positif')
    if (typeof idempotency_key !== 'string' || idempotency_key.length < 8 || idempotency_key.length > 100)
      return errorResponse('idempotency_key tidak valid')
    if (
      typeof bukti_transfer_url !== 'string' ||
      !bukti_transfer_url.startsWith(`${user.id}/`) ||
      bukti_transfer_url.includes('..')
    ) return errorResponse('Bukti transfer wajib diunggah ke penyimpanan privat')

    const { error: proofError } = await supabaseAdmin.storage
      .from('payment-proofs')
      .createSignedUrl(bukti_transfer_url, 60)
    if (proofError) return errorResponse('File bukti transfer tidak ditemukan', 400)

    const { data: settingsData } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .in('key', ['koin_to_rupiah_rate', 'min_topup_koin', 'max_topup_koin'])
    const settings = Object.fromEntries((settingsData ?? []).map((row) => [row.key, Number(row.value)]))
    const rate = settings.koin_to_rupiah_rate || 500
    const minTopup = settings.min_topup_koin || 1
    const maxTopup = settings.max_topup_koin || 10000
    if (jumlah_koin < minTopup || jumlah_koin > maxTopup)
      return errorResponse(`Jumlah top up harus ${minTopup}-${maxTopup} koin`)

    const { data: existing } = await supabaseAdmin
      .from('topup_requests')
      .select('id, status')
      .eq('idempotency_key', idempotency_key)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing)
      return successResponse({ success: true, already_submitted: true, request_id: existing.id })

    const { data: inserted, error } = await supabaseAdmin
      .from('topup_requests')
      .insert({
        user_id: user.id,
        jumlah_koin,
        jumlah_rupiah: jumlah_koin * rate,
        bukti_transfer_url,
        status: 'pending',
        idempotency_key,
      })
      .select('id')
      .single()

    if (error?.code === '23505') {
      const { data: raced } = await supabaseAdmin
        .from('topup_requests')
        .select('id')
        .eq('idempotency_key', idempotency_key)
        .eq('user_id', user.id)
        .single()
      if (raced)
        return successResponse({ success: true, already_submitted: true, request_id: raced.id })
      return errorResponse('Permintaan duplikat atau masih diproses', 409)
    }
    if (error) return errorResponse(error.message, 500)
    return successResponse({ success: true, already_submitted: false, request_id: inserted?.id })
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message === 'Account suspended' || e.message === 'Account deleted'
      ? 403 : e.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
