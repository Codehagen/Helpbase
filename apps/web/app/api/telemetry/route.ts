import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

/**
 * Opt-in CLI telemetry ingestion.
 *
 * The CLI POSTs one small JSON blob per command invocation. We validate
 * the shape, drop anything that looks malformed, and insert into
 * public.cli_telemetry_events via the service role key (the table has
 * RLS on with no policies — the route is the only writer).
 *
 * No auth. No PII. Users opt in client-side and can turn this off any
 * time with `helpbase config set telemetry off`.
 */

export const runtime = "nodejs"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const EventSchema = z.object({
  anonId: z.string().uuid(),
  command: z.string().min(1).max(32),
  durationMs: z.number().int().nonnegative().lt(3_600_000),
  exitCode: z.number().int(),
  flags: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/i).max(40)).max(20),
  cliVersion: z.string().min(1).max(32),
  nodeVersion: z.string().min(1).max(32),
  platform: z.string().min(1).max(16),
  arch: z.string().min(1).max(16),
})

// Crude per-anon-id rate limit: at most N events per minute per install,
// enforced via an in-memory map. We don't care about clustering — this is
// belt-and-braces so a buggy install can't flood the table.
const RATE_LIMIT_PER_MINUTE = 60
const rateLimit = new Map<string, { count: number; windowStart: number }>()

function rateLimited(anonId: string): boolean {
  const now = Date.now()
  const entry = rateLimit.get(anonId)
  if (!entry || now - entry.windowStart > 60_000) {
    rateLimit.set(anonId, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT_PER_MINUTE
}

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    // Config missing. Accept silently so the CLI's fire-and-forget dispatch
    // doesn't error — 204 is more honest than 500 for this case.
    return new NextResponse(null, { status: 204 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  const parsed = EventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid shape" }, { status: 400 })
  }

  if (rateLimited(parsed.data.anonId)) {
    return new NextResponse(null, { status: 429 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await admin.from("cli_telemetry_events").insert({
    anon_id: parsed.data.anonId,
    command: parsed.data.command,
    duration_ms: parsed.data.durationMs,
    exit_code: parsed.data.exitCode,
    flags: parsed.data.flags,
    cli_version: parsed.data.cliVersion,
    node_version: parsed.data.nodeVersion,
    platform: parsed.data.platform,
    arch: parsed.data.arch,
  })

  if (error) {
    // Log but don't leak details. Client doesn't care either way.
    console.error("telemetry insert failed:", error.message)
    return new NextResponse(null, { status: 204 })
  }

  return new NextResponse(null, { status: 204 })
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "cli-telemetry" })
}
