import { kv } from "@vercel/kv"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

/**
 * Rate limiting for the public MCP endpoint.
 *
 * Two layers:
 *   1. Per-IP burst — 100 requests / 5 min / IP (Vercel KV)
 *   2. Per-tenant daily cap — 10,000 tool calls / day / tenant (Supabase row)
 *
 * The per-IP layer uses Vercel KV (serverless-safe, shared across instances).
 * Local dev without KV env vars: checks degrade to no-op (log only) so
 * `pnpm dev` works without a KV token.
 *
 * The per-tenant layer writes to `tenants.mcp_calls_today` via Supabase.
 * Daily reset is handled on every successful `deploy_tenant` RPC call, and
 * could additionally be driven by a Vercel CRON (v1.5).
 */

const IP_WINDOW_SECONDS = 5 * 60 // 5 min
const IP_LIMIT = 100
const TENANT_DAILY_LIMIT = 10_000

const hasKv = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN

export type RateLimitResult =
  | { ok: true }
  | { ok: false; reason: "per-ip" | "per-tenant"; retryAfterSeconds: number }

/**
 * Enforce per-IP burst using a fixed-window counter on Vercel KV.
 *
 *   key: rl:ip:{ip}
 *   value: count (integer)
 *   TTL: IP_WINDOW_SECONDS (set on first write)
 *
 * `increment + expire` is not atomic in the KV SDK, but the race window
 * is ~1ms and the failure mode is being slightly too lenient near window
 * boundaries — acceptable for v1. If abuse becomes a concern, upgrade
 * to a proper sliding window with Upstash's rate-limit SDK.
 */
export async function enforceIpRateLimit(ip: string): Promise<RateLimitResult> {
  if (!hasKv) return { ok: true }
  const key = `rl:ip:${ip}`
  try {
    const count = await kv.incr(key)
    if (count === 1) {
      // First write in this window; set TTL.
      await kv.expire(key, IP_WINDOW_SECONDS)
    }
    if (count > IP_LIMIT) {
      const ttl = await kv.ttl(key)
      return { ok: false, reason: "per-ip", retryAfterSeconds: Math.max(1, ttl) }
    }
    return { ok: true }
  } catch {
    // KV unreachable — fail open rather than block legitimate traffic.
    return { ok: true }
  }
}

/**
 * Enforce per-tenant daily cap. Increments `tenants.mcp_calls_today`;
 * if over limit, returns 429 and the caller can 429 the client.
 *
 * Fire-and-forget pattern: we READ the current count and check limit
 * BEFORE incrementing, then increment async. Writes are not blocked
 * on the critical path. Small over-allow is acceptable; the purpose
 * is abuse prevention, not billing accuracy.
 */
export async function enforceTenantDailyCap(
  supabaseClient: SupabaseClient<Database>,
  tenantId: string,
): Promise<RateLimitResult> {
  const { data } = await supabaseClient
    .from("tenants")
    .select("mcp_calls_today")
    .eq("id", tenantId)
    .maybeSingle()
  const current = data?.mcp_calls_today ?? 0
  if (current >= TENANT_DAILY_LIMIT) {
    // Until midnight UTC (cheap heuristic — exact reset handled on next deploy).
    const now = new Date()
    const midnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    )
    const retry = Math.max(60, Math.floor((midnight - now.getTime()) / 1000))
    return { ok: false, reason: "per-tenant", retryAfterSeconds: retry }
  }
  // Async increment; not awaited.
  void supabaseClient
    .from("tenants")
    .update({ mcp_calls_today: current + 1 })
    .eq("id", tenantId)
    .then(() => undefined)
  return { ok: true }
}

export function extractClientIp(request: Request): string {
  // Vercel sets x-forwarded-for. First entry is the client IP.
  const fwd = request.headers.get("x-forwarded-for") ?? ""
  const first = fwd.split(",")[0]?.trim()
  if (first) return first
  const real = request.headers.get("x-real-ip")
  if (real) return real
  return "unknown"
}
