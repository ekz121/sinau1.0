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
    const { amount } = await req.json()
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return errorResponse('amount must be a positive number')
    }
    // Guard against unreasonable amounts
    if (amount > 1000) return errorResponse('Amount too large', 400)

    // 4. Call atomic topup RPC (service role has EXECUTE grant)
    const { data, error } = await supabaseAdmin.rpc('process_topup', {
      p_user_id: user.id,
      p_amount: amount,
    })

    if (error) return errorResponse(error.message, 500)

    return successResponse(data)
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message === 'Account suspended' ? 403
      : e.message?.includes('token') ? 401
      : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
