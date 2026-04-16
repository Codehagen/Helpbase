import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { AuthSession } from "./auth.js"

/**
 * Thin Supabase client factory. Auth lives in lib/auth.ts — this file only
 * knows how to produce a client given (or not given) a session.
 */

// Public Supabase credentials (safe to embed in CLI). This must match the
// project apps/web and the hosted-tier tables live on — otherwise the CLI
// authenticates against one project while the web app reads from another,
// so deploys go nowhere and logins look "expired" against the wrong audience.
const SUPABASE_URL = "https://rrlqttgjynfgxbhjkxnm.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJybHF0dGdqeW5mZ3hiaGpreG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNTUzMTEsImV4cCI6MjA5MTkzMTMxMX0.EhBxN3v_RuTqorh6vETR7k6rZxfhJPKCA12JLmMVNO4"

export function getAnonSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

/**
 * Build a Supabase client authenticated as the session's user.
 * Refresh-token-less sessions (HELPBASE_TOKEN) still work — writes go through
 * RLS with the access token on every request.
 */
export async function getAuthedSupabase(session: AuthSession): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  })
  if (session.refreshToken) {
    await client.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    })
  }
  return client
}
