import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { supabaseAdmin, getAuthUser, checkNotSuspended, errorResponse, successResponse } from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const user = await getAuthUser(req)
    await checkNotSuspended(user.id)
    const { jumlah_koin, data_tujuan, idempotency_key } = await req.json()

    const { data: minData } = await supabaseAdmin
      .from('app_settings').select('value').eq('key', 'min_payout_koin').single()
    const minPayout = parseInt(minData?.value ?? '50') || 50

    if (!Number.isInteger(jumlah_koin) || jumlah_koin < minPayout)
      return errorResponse(`Minimum pencairan ${minPayout} koin`)
    if (typeof idempotency_key !== 'string' || idempotency_key.length < 8 || idempotency_key.length > 100)
      return errorResponse('idempotency_key tidak valid')
    if (!data_tujuan?.bank || !data_tujuan?.nomor || !data_tujuan?.nama_pemilik)
      return errorResponse('Data tujuan tidak lengkap (bank, nomor, nama_pemilik)')
    if (
      typeof data_tujuan.bank !== 'string' || data_tujuan.bank.length > 50 ||
      typeof data_tujuan.nomor !== 'string' || data_tujuan.nomor.length > 30 ||
      typeof data_tujuan.nama_pemilik !== 'string' || data_tujuan.nama_pemilik.length > 100
    ) return errorResponse('Data tujuan tidak valid atau melebihi panjang maksimum')

    const { data, error } = await supabaseAdmin.rpc('request_payout', {
      p_creator_id: user.id,
      p_jumlah_koin: jumlah_koin,
      p_data_tujuan: data_tujuan,
      p_idempotency_key: idempotency_key,
    })
    if (error) {
      if (error.code === '23505') return errorResponse('Masih ada pencairan yang menunggu diproses', 409)
      return errorResponse(error.message, 500)
    }
    return successResponse(data)
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message === 'Account suspended' || e.message === 'Account deleted'
      ? 403 : e.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
