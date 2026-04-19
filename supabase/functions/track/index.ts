import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const ALLOWED_EVENTS = new Set([
  "page_view",
  "hero_install_copied",
  "hero_demo_clicked",
  "pricing_tier_clicked",
  "demo_opened",
  "faq_expanded",
])

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: CORS_HEADERS })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response("bad json", { status: 400, headers: CORS_HEADERS })
  }

  if (!isPlainObject(body)) {
    return new Response("bad payload", { status: 400, headers: CORS_HEADERS })
  }

  const event = typeof body.event === "string" ? body.event : ""
  if (!ALLOWED_EVENTS.has(event)) {
    return new Response("event not allowed", { status: 400, headers: CORS_HEADERS })
  }

  const path = typeof body.path === "string" && body.path.length <= 2048 ? body.path : null
  const metadata = isPlainObject(body.metadata) ? body.metadata : {}

  // Cap metadata size to ~2KB of JSON so one rogue client cannot blow up the row.
  const metadataSerialized = JSON.stringify(metadata)
  const metadataTrimmed = metadataSerialized.length > 2048 ? {} : metadata

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  const ua = req.headers.get("user-agent") ?? "unknown"
  const day = new Date().toISOString().slice(0, 10)
  const session_hash = await sha256Hex(`${ip}|${ua}|${day}`)

  const url = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !serviceKey) {
    return new Response("misconfigured", { status: 500, headers: CORS_HEADERS })
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await supabase.from("marketing_events").insert({
    event,
    path,
    metadata: metadataTrimmed,
    session_hash,
  })

  if (error) {
    return new Response("insert failed", { status: 500, headers: CORS_HEADERS })
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS })
})
