import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'

// @ts-ignore Deno is available in Supabase Edge Functions runtime
declare const Deno: { env: { get(key: string): string | undefined } }

// Service role client — bypasses RLS, only used server-side in Edge Functions
export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

// Get authenticated user from Authorization header
export async function getAuthUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('Missing authorization header')

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) throw new Error('Invalid or expired token')

  return user
}

// Check if user is suspended
export async function checkNotSuspended(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('is_suspended, is_deleted, role')
    .eq('id', userId)
    .single()

  if (error) throw new Error('Failed to fetch profile')
  if (data?.is_suspended) throw new Error('Account suspended')
  if (data?.is_deleted) throw new Error('Account deleted')

  return data
}

export function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function successResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

