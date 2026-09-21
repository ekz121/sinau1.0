import { handleCors } from '../_shared/cors.ts'
import { errorResponse } from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  // Legacy endpoint intentionally disabled. A top-up must be submitted with
  // payment proof and approved by an admin through the atomic approval RPC.
  return errorResponse(
    'Endpoint dinonaktifkan. Gunakan submit-topup-request dan admin-approve-topup.',
    410,
  )
})
