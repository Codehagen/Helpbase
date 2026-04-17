import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

/**
 * Service-role Supabase client. Bypasses RLS — use only in trusted server
 * code (API routes). Never send this client to the browser and never use
 * with untrusted input without parameterized queries.
 *
 * Used by /api/v1/llm/* to write `llm_usage_events` rows and read the
 * `global_daily_tokens` counter, both of which are service-role-only.
 */

let cached: SupabaseClient<Database> | null = null

export function getServiceRoleClient(): SupabaseClient<Database> {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — set both in the Vercel project env.",
    )
  }
  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

/**
 * Resolve the user behind a bearer token. Uses Supabase's getUser RPC — one
 * network call per request. Swap to local JWT verification if latency becomes
 * an issue (SUPABASE_JWT_SECRET + a signature library).
 */
export async function verifyBearerToken(
  token: string,
): Promise<{ userId: string; email: string | null } | null> {
  const client = getServiceRoleClient()
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return null
  return { userId: data.user.id, email: data.user.email ?? null }
}
