import { NextResponse } from "next/server"
import type { WireErrorBody, WireErrorCode, WireQuotaStatus, WireUsage } from "@workspace/shared/llm-wire"
import { BYOK_DOCS_URL, UPGRADE_URL } from "@workspace/shared/llm-wire"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import { auth } from "@/lib/auth"
import {
  HELPBASE_OIDC_AUDIENCE,
  OidcRejected,
  extractBearer,
  isGithubOidcToken,
  verifyGithubOidcJwt,
  type GithubOidcClaims,
  type OidcRejectReason,
} from "@/lib/oidc-verify"

/**
 * Shared helpers for /api/v1/llm/generate-object and /generate-text.
 *
 *   withAuthAndQuota(req) → AuthedContext  on success
 *                        → NextResponse    on any gate failure (401/429/503)
 *
 * Two auth lanes dispatch from one entry point:
 *
 *      Authorization: Bearer <token>
 *                   │
 *                   ▼
 *             peekIssuer()
 *             ├── GitHub OIDC  ──► withCiAuthAndQuota()   ← per-repo quota
 *             └── other / none ──► withUserAuthAndQuota() ← Better Auth, per-user
 *
 * The route handler then runs the Vercel AI SDK call and calls
 * logUsageEvent(gate, ...) on completion. logUsageEvent writes to the
 * correct usage table based on `gate.kind`.
 *
 * Quota math (both lanes):
 *   - Per-principal daily cap:  500,000 tokens (free tier)
 *   - Per-call ceiling:          100,000 output tokens
 *   - Global daily cap:       10,000,000 tokens (circuit breaker, shared)
 */

export const DAILY_USER_LIMIT = 500_000
export const PER_CALL_CEILING = 100_000
export const GLOBAL_DAILY_LIMIT = 10_000_000

// ── Auth context ───────────────────────────────────────────────────────

interface GateCommon {
  usedToday: number
  resetAtIso: string
  maxOutputTokens: number
}

export interface UserAuthedContext extends GateCommon {
  kind: "user"
  userId: string
}

export interface CiAuthedContext extends GateCommon {
  kind: "ci"
  /** GitHub numeric repo ID (stable across renames + org transfers). */
  repoId: number
  /** owner/repo at time of token issue — logging only, not keyed on. */
  repoSlug: string
  owner: string
  eventName: string
  ref: string | null
}

export type AuthedContext = UserAuthedContext | CiAuthedContext

// ── Auth + quota gate ──────────────────────────────────────────────────

export async function withAuthAndQuota(
  req: Request,
): Promise<AuthedContext | NextResponse> {
  const bearer = extractBearer(req.headers)
  if (bearer && isGithubOidcToken(bearer)) {
    return withCiAuthAndQuota(bearer)
  }
  return withUserAuthAndQuota(req)
}

async function withUserAuthAndQuota(
  req: Request,
): Promise<UserAuthedContext | NextResponse> {
  // Better Auth's bearer plugin reads Authorization: Bearer <token> and
  // resolves it to a session via public.session.token. Same bearer shape
  // as pre-migration (Supabase JWTs); callers see no API change.
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return wireError(401, "auth_required", "Missing, malformed, or expired session token.")
  }

  // Parallel: read user's today-tokens + global counter.
  const client = getServiceRoleClient()
  const [userRes, globalRes] = await Promise.all([
    client.rpc("get_user_tokens_today", { p_user_id: session.user.id }),
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
    kind: "user",
    userId: session.user.id,
    usedToday,
    resetAtIso,
    maxOutputTokens,
  }
}

async function withCiAuthAndQuota(
  token: string,
): Promise<CiAuthedContext | NextResponse> {
  // Verify the GitHub OIDC JWT first — crypto check + claim validation
  // + fork-PR defense. Any failure maps to a specific wire error code
  // so the CI log message points at the exact fix.
  let claims: GithubOidcClaims
  try {
    claims = await verifyGithubOidcJwt(token)
  } catch (err) {
    if (err instanceof OidcRejected) return oidcRejectToResponse(err)
    // Unknown failure — don't leak internals, treat as upstream error.
    return wireError(503, "internal_error", "OIDC verification failed unexpectedly.")
  }

  const repoId = Number.parseInt(claims.repository_id, 10)
  if (!Number.isFinite(repoId) || repoId <= 0) {
    return wireError(
      400,
      "oidc_invalid",
      "OIDC token repository_id is not a valid positive integer.",
    )
  }

  // Parallel: per-repo today-tokens + shared global counter.
  const client = getServiceRoleClient()
  const [repoRes, globalRes] = await Promise.all([
    client.rpc("get_repo_tokens_today", { p_repo_id: repoId }),
    client.rpc("get_global_tokens_today"),
  ])

  if (repoRes.error || globalRes.error) {
    return wireError(
      503,
      "internal_error",
      "Supabase is unavailable. Retry in a moment.",
    )
  }

  const usedToday = Number(repoRes.data ?? 0)
  const globalToday = Number(globalRes.data ?? 0)
  const resetAtIso = nextUtcMidnightIso()

  if (usedToday >= DAILY_USER_LIMIT) {
    return wireError(
      429,
      "ci_quota_exceeded",
      "This repository has used its daily free-tier token quota.",
      {
        usedToday,
        dailyLimit: DAILY_USER_LIMIT,
        resetAt: resetAtIso,
        upgradeUrl: UPGRADE_URL,
        byokDocsUrl: BYOK_DOCS_URL,
      },
    )
  }

  if (globalToday >= GLOBAL_DAILY_LIMIT) {
    return wireError(503, "global_cap_hit", "helpbase is over its daily cap.", {
      resetAt: resetAtIso,
      byokDocsUrl: BYOK_DOCS_URL,
    })
  }

  const remaining = DAILY_USER_LIMIT - usedToday
  const maxOutputTokens = Math.min(PER_CALL_CEILING, remaining)

  return {
    kind: "ci",
    repoId,
    repoSlug: claims.repository,
    owner: claims.repository_owner,
    eventName: claims.event_name ?? "unknown",
    ref: claims.ref ?? null,
    usedToday,
    resetAtIso,
    maxOutputTokens,
  }
}

/**
 * Map an OidcRejected reason to a wire error. Each reason gets a
 * message that points at the exact fix so the CI workflow log tells
 * the developer what to change.
 */
function oidcRejectToResponse(err: OidcRejected): NextResponse<WireErrorBody> {
  const map: Record<OidcRejectReason, { status: number; code: WireErrorCode; msg: string }> = {
    missing: {
      status: 401,
      code: "oidc_invalid",
      msg: "OIDC token is missing. Add `permissions: id-token: write` to your workflow.",
    },
    malformed: {
      status: 401,
      code: "oidc_invalid",
      msg: "OIDC token is malformed.",
    },
    wrong_issuer: {
      status: 401,
      code: "oidc_invalid",
      msg: "OIDC token is not from GitHub Actions.",
    },
    wrong_audience: {
      status: 401,
      code: "oidc_wrong_audience",
      msg: `OIDC audience mismatch. Expected ${HELPBASE_OIDC_AUDIENCE}. Update the \`audience\` parameter in your workflow's id-token step.`,
    },
    expired: {
      status: 401,
      code: "oidc_invalid",
      msg: "OIDC token has expired (tokens live ~6 minutes). Retry from the workflow.",
    },
    signature: {
      status: 401,
      code: "oidc_invalid",
      msg: "OIDC token signature is invalid.",
    },
    algorithm: {
      status: 401,
      code: "oidc_invalid",
      msg: "OIDC token uses a disallowed algorithm.",
    },
    fork_pr: {
      status: 401,
      code: "oidc_invalid",
      msg: "OIDC tokens from fork PRs are not accepted.",
    },
    missing_repo_id: {
      status: 401,
      code: "oidc_invalid",
      msg: "OIDC token is missing the repository_id claim.",
    },
    jwks_unreachable: {
      status: 503,
      code: "internal_error",
      msg: "Could not reach GitHub's JWKS endpoint to verify the OIDC token. Retry.",
    },
  }
  const { status, code, msg } = map[err.reason]
  return wireError(status, code, msg)
}

// ── Usage logging ──────────────────────────────────────────────────────

export interface LogUsageInput {
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
 * Insert one row into the usage table for this principal AND bump the
 * shared global counter. User-lane writes to `llm_usage_events`; CI
 * lane writes to `llm_usage_events_ci`. Global counter is shared —
 * both paths call the same `increment_global_tokens` RPC so the 10M/day
 * circuit breaker covers the union of usage.
 *
 * Both writes are awaited here so the usedToday reflected in the route's
 * response is fresh. Failures are logged to stderr and don't crash the
 * response (fail-open — the user already got their answer).
 */
export async function logUsageEvent(
  context: AuthedContext,
  input: LogUsageInput,
): Promise<void> {
  const client = getServiceRoleClient()
  const total = input.promptTokens + input.completionTokens

  if (context.kind === "user") {
    const { error: insertErr } = await client.from("llm_usage_events").insert({
      user_id: context.userId,
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
      console.error("[llm_usage_events insert failed]", {
        userId: context.userId,
        route: input.route,
        total,
        message: insertErr.message,
      })
    }
  } else {
    const { error: insertErr } = await client.from("llm_usage_events_ci").insert({
      repo_id: context.repoId,
      repo_slug: context.repoSlug,
      owner: context.owner,
      event_name: context.eventName,
      ref: context.ref,
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
      console.error("[llm_usage_events_ci insert failed]", {
        repoId: context.repoId,
        route: input.route,
        total,
        message: insertErr.message,
      })
    }
  }

  if (input.status === "ok" && total > 0) {
    const today = new Date().toISOString().slice(0, 10)
    // Atomic increment via SQL function — see migration
    // `atomic_increment_global_tokens`. The previous client-side upsert
    // pattern (onConflict: "day") OVERWROTE the daily counter on every
    // call, silently disabling the 10M/day global circuit breaker.
    // Shared by BOTH auth lanes so the global cap covers union usage.
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
