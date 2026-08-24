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

    const { jumlah_koin, data_tujuan } = await req.json()

    // Baca min_payout dari app_settings (tidak hardcode 50)
    const { data: minData } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'min_payout_koin')
      .single()
    const minPayout = parseInt(minData?.value ?? '50') || 50

    if (!jumlah_koin || typeof jumlah_koin !== 'number' || jumlah_koin < minPayout)
      return errorResponse(`Minimum pencairan ${minPayout} koin`)

    if (!data_tujuan?.bank || !data_tujuan?.nomor || !data_tujuan?.nama_pemilik)
      return errorResponse('Data tujuan tidak lengkap (bank, nomor, nama_pemilik)')

    // Validasi panjang field untuk mencegah data sampah
    if (data_tujuan.bank.length > 50 || data_tujuan.nomor.length > 30 || data_tujuan.nama_pemilik.length > 100)
      return errorResponse('Data tujuan melebihi panjang maksimum')

    // Panggil RPC atomik — process_purchase sudah baca min & rate dari app_settings
    const { data, error } = await supabaseAdmin.rpc('request_payout', {
      p_creator_id: user.id,
      p_jumlah_koin: jumlah_koin,
      p_data_tujuan: data_tujuan,
    })

    if (error) return errorResponse(error.message, 500)
    return successResponse(data)
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message === 'Account suspended' ? 403 : e.message?.includes('token') ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
