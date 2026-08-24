import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  supabaseAdmin,
  getAuthUser,
  checkNotSuspended,
  errorResponse,
  successResponse,
} from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    // 1. Authenticate
    const user = await getAuthUser(req)

    // 2. Check suspension
    await checkNotSuspended(user.id)

    // 3. Parse body
    const { video_id } = await req.json()
    if (!video_id) return errorResponse('video_id is required')

    // 4. Call atomic PL/pgSQL function (service role bypasses RLS, has EXECUTE grant)
    const { data, error } = await supabaseAdmin.rpc('process_purchase', {
      p_viewer_id: user.id,
      p_video_id: video_id,
    })

    if (error) {
      // Parse error message for known cases
      const msg = error.message || ''
      if (msg.includes('Insufficient balance')) return errorResponse('Saldo tidak cukup', 402)
      if (msg.includes('Cannot purchase own video')) return errorResponse('Tidak bisa membeli video sendiri', 403)
      if (msg.includes('not found or not approved')) return errorResponse('Video tidak ditemukan', 404)
      return errorResponse(msg, 500)
    }

    return successResponse(data)
  } catch (err) {
    const status = err.message === 'Account suspended' ? 403
      : err.message?.includes('token') ? 401
      : 500
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
