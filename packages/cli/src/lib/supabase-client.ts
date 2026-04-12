import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { AuthSession } from "./auth.js"

/**
 * Thin Supabase client factory. Auth lives in lib/auth.ts — this file only
 * knows how to produce a client given (or not given) a session.
 */

// Public Supabase credentials (safe to embed in CLI)
const SUPABASE_URL = "https://yamxvyexqxpdrnoymwhv.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhbXh2eWV4cXhwZHJub3ltd2h2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTI5MjUsImV4cCI6MjA5MTQyODkyNX0.CIV8-oRqCCfTrAIyq0iTLYpEnJHkUkqQ4VU3ImwLUFo"

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
