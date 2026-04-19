import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

import { handleTrack, type InsertClient } from "./handler.ts"

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  let client: InsertClient | null = null
  if (url && serviceKey) {
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    client = {
      insert: (row) => supabase.from("marketing_events").insert(row),
    }
  }

  return handleTrack(req, { client })
})
