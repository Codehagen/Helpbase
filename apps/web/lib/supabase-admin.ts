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

// verifyBearerToken removed 2026-04-17 — replaced by Better Auth's
// auth.api.getSession({ headers }) in every call site.
