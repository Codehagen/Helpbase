import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

/**
 * Supabase client for the web app (anon key, RLS-based reads).
 * Only usable at runtime when env vars are set. During build (without env vars),
 * queries will fail gracefully with empty results.
 */
export const supabase: SupabaseClient<Database> = supabaseUrl
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : (new Proxy({} as SupabaseClient<Database>, {
      get: () => () => ({ data: null, error: { message: "Supabase not configured" } }),
    }) as SupabaseClient<Database>)
