// Pure handler for the `track` edge function. Extracted so the logic can be
// unit-tested from Node (vitest) without the Deno runtime. The index.ts entry
// point wires Deno.env + Deno.serve + Supabase client around this.

export const ALLOWED_EVENTS = new Set<string>([
  "page_view",
  "hero_install_copied",
  "hero_demo_clicked",
  "pricing_tier_clicked",
  "demo_opened",
  "faq_expanded",
])

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

export interface InsertClient {
  insert: (row: {
    event: string
    path: string | null
    metadata: Record<string, unknown>
    session_hash: string
  }) => Promise<{ error: { message: string } | null }>
}

export interface TrackDeps {
  client: InsertClient | null
  now?: () => Date
}

export async function handleTrack(
  req: Request,
  deps: TrackDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", {
      status: 405,
      headers: CORS_HEADERS,
    })
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
    return new Response("event not allowed", {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  const path =
    typeof body.path === "string" && body.path.length <= 2048 ? body.path : null
  const metadata = isPlainObject(body.metadata) ? body.metadata : {}

  const metadataSerialized = JSON.stringify(metadata)
  const metadataTrimmed: Record<string, unknown> =
    metadataSerialized.length > 2048 ? {} : metadata

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  const ua = req.headers.get("user-agent") ?? "unknown"
  const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10)
  const session_hash = await sha256Hex(`${ip}|${ua}|${day}`)

  if (!deps.client) {
    return new Response("misconfigured", {
      status: 500,
      headers: CORS_HEADERS,
    })
  }

  const { error } = await deps.client.insert({
    event,
    path,
    metadata: metadataTrimmed,
    session_hash,
  })

  if (error) {
    return new Response("insert failed", {
      status: 500,
      headers: CORS_HEADERS,
    })
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
