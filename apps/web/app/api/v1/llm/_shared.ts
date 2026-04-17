import { NextResponse } from "next/server"
import type { WireErrorBody, WireErrorCode, WireQuotaStatus, WireUsage } from "@workspace/shared/llm-wire"
import { BYOK_DOCS_URL, UPGRADE_URL } from "@workspace/shared/llm-wire"
import { getServiceRoleClient, verifyBearerToken } from "@/lib/supabase-admin"

/**
 * Shared helpers for /api/v1/llm/generate-object and /generate-text.
 *
 *   withAuthAndQuota(req) → { userId, quota, maxOutputTokens }  on success
 *                         → NextResponse on any gate failure (401/429/503)
 *
 * The route handler then runs the Vercel AI SDK call and calls
 * logUsageEvent() on completion, successful OR failed.
 *
 * Quota math:
 *   - Per-user daily cap:  500,000 tokens (free tier)
 *   - Per-call ceiling:     100,000 output tokens
 *   - Global daily cap:  10,000,000 tokens (circuit breaker)
 *
 * Overrun is accepted (same fire-and-forget pattern as apps/web/lib/rate-limit.ts).
 */

export const DAILY_USER_LIMIT = 500_000
export const PER_CALL_CEILING = 100_000
export const GLOBAL_DAILY_LIMIT = 10_000_000

// ── Auth + quota gate ──────────────────────────────────────────────────

export interface AuthedContext {
  userId: string
  usedToday: number
  resetAtIso: string
  maxOutputTokens: number
}

export async function withAuthAndQuota(
  req: Request,
): Promise<AuthedContext | NextResponse> {
  const authz = req.headers.get("authorization") ?? ""
  const match = /^Bearer\s+(.+)$/i.exec(authz)
  if (!match) {
    return wireError(401, "auth_required", "Missing or malformed Authorization header.")
  }
  const token = match[1]!

  const user = await verifyBearerToken(token)
  if (!user) {
    return wireError(401, "auth_required", "Invalid or expired session token.")
  }

  // Parallel: read user's today-tokens + global counter.
  const client = getServiceRoleClient()
  const [userRes, globalRes] = await Promise.all([
    client.rpc("get_user_tokens_today", { p_user_id: user.userId }),
    client.rpc("get_global_tokens_today"),
  ])

  if (userRes.error || globalRes.error) {
    // Failing closed on DB error — safer than silently gifting tokens.
    return wireError(
      503,
      "internal_error",
      "Supabase is unavailable. Retry in a moment.",
    )
  }

  const usedToday = Number(userRes.data ?? 0)
  const globalToday = Number(globalRes.data ?? 0)
  const resetAtIso = nextUtcMidnightIso()

  if (usedToday >= DAILY_USER_LIMIT) {
    return wireError(429, "quota_exceeded", "Daily free-tier token quota reached.", {
      usedToday,
      dailyLimit: DAILY_USER_LIMIT,
      resetAt: resetAtIso,
      upgradeUrl: UPGRADE_URL,
      byokDocsUrl: BYOK_DOCS_URL,
    })
  }

  if (globalToday >= GLOBAL_DAILY_LIMIT) {
    return wireError(503, "global_cap_hit", "helpbase is over its daily cap.", {
      resetAt: resetAtIso,
      byokDocsUrl: BYOK_DOCS_URL,
    })
  }

  // Clamp per-call output cap to what's actually left.
  const remaining = DAILY_USER_LIMIT - usedToday
  const maxOutputTokens = Math.min(PER_CALL_CEILING, remaining)

  return {
    userId: user.userId,
    usedToday,
    resetAtIso,
    maxOutputTokens,
  }
}

// ── Usage logging ──────────────────────────────────────────────────────

export interface LogUsageInput {
  userId: string
  route: "generate-object" | "generate-text"
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  status: "ok" | "gateway_error" | "schema_error"
  latencyMs: number
  requestId?: string
}

/**
 * Insert one row into `llm_usage_events` AND upsert the global counter.
 * Both are fire-and-forget relative to the happy path: we don't await
 * them on the critical path of the response, but we do await here so the
 * usedToday reflected in the response is fresh.
 */
export async function logUsageEvent(input: LogUsageInput): Promise<void> {
  const client = getServiceRoleClient()
  const total = input.promptTokens + input.completionTokens

  const { error: insertErr } = await client.from("llm_usage_events").insert({
    user_id: input.userId,
    route: input.route,
    model: input.model,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    cost_usd: input.costUsd,
    status: input.status,
    latency_ms: input.latencyMs,
    request_id: input.requestId ?? null,
  })

  if (insertErr) {
    // Failure mode #2 from the plan's failure-modes table: fail-open, log
    // to Vercel logs for later reconciliation (TODO-022).
    console.error("[llm_usage_events insert failed]", {
      userId: input.userId,
      route: input.route,
      total,
      message: insertErr.message,
    })
  }

  if (input.status === "ok" && total > 0) {
    const today = new Date().toISOString().slice(0, 10)
    // Atomic increment via SQL function — see migration
    // `atomic_increment_global_tokens`. The previous client-side upsert
    // pattern (onConflict: "day") OVERWROTE the daily counter on every
    // call, silently disabling the 10M/day global circuit breaker.
    // Concurrent requests also need true atomicity; a read-modify-write
    // is race-prone even on a single instance.
    const { error: incrErr } = await client.rpc("increment_global_tokens", {
      p_day: today,
      p_delta: total,
    })
    if (incrErr) {
      console.error("[global_daily_tokens increment failed]", {
        today,
        total,
        message: incrErr.message,
      })
    }
  }
}

// ── Quota snapshot (for response payloads) ─────────────────────────────

export function quotaSnapshot(usedTodayAfter: number, resetAtIso: string): WireQuotaStatus {
  return {
    usedToday: usedTodayAfter,
    dailyLimit: DAILY_USER_LIMIT,
    resetAt: resetAtIso,
  }
}

export function wireUsageFromSdk(usage: unknown, costUsd = 0): WireUsage {
  const u = (usage ?? {}) as {
    inputTokens?: number
    outputTokens?: number
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  const prompt = u.inputTokens ?? u.promptTokens ?? 0
  const completion = u.outputTokens ?? u.completionTokens ?? 0
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: u.totalTokens ?? prompt + completion,
    costUsd,
  }
}

// ── Error envelope ─────────────────────────────────────────────────────

export function wireError(
  status: number,
  code: WireErrorCode,
  message: string,
  extra: Partial<WireErrorBody> = {},
): NextResponse<WireErrorBody> {
  return NextResponse.json<WireErrorBody>(
    { error: code, message, ...extra },
    { status },
  )
}

// ── Time helpers ───────────────────────────────────────────────────────

export function nextUtcMidnightIso(): string {
  const d = new Date()
  const next = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0),
  )
  return next.toISOString()
}
