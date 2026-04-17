/**
 * Error classes thrown by the shared LLM client (packages/shared/src/llm.ts).
 *
 * These are plain classes with no CLI imports — `@workspace/shared` must not
 * depend on `helpbase` (the CLI). The CLI catches each of these at the command
 * layer and wraps it in a HelpbaseError with the appropriate `fix:` copy.
 *
 * Mirrors the WireErrorCode enum in llm-wire.ts.
 */

import type { WireQuotaStatus } from "./llm-wire.js"

export class AuthRequiredError extends Error {
  readonly code = "auth_required" as const
  constructor(message = "Authentication required to call the helpbase LLM proxy") {
    super(message)
    this.name = "AuthRequiredError"
  }
}

export class QuotaExceededError extends Error {
  readonly code = "quota_exceeded" as const
  readonly usedToday: number
  readonly dailyLimit: number
  readonly resetAt: string
  readonly upgradeUrl: string
  readonly byokDocsUrl: string
  constructor(init: {
    usedToday: number
    dailyLimit: number
    resetAt: string
    upgradeUrl: string
    byokDocsUrl: string
    message?: string
  }) {
    super(init.message ?? "Daily free-tier token quota exhausted")
    this.name = "QuotaExceededError"
    this.usedToday = init.usedToday
    this.dailyLimit = init.dailyLimit
    this.resetAt = init.resetAt
    this.upgradeUrl = init.upgradeUrl
    this.byokDocsUrl = init.byokDocsUrl
  }
}

export class GlobalCapError extends Error {
  readonly code = "global_cap_hit" as const
  readonly resetAt: string
  readonly byokDocsUrl: string
  constructor(init: { resetAt: string; byokDocsUrl: string; message?: string }) {
    super(init.message ?? "helpbase global daily cap reached")
    this.name = "GlobalCapError"
    this.resetAt = init.resetAt
    this.byokDocsUrl = init.byokDocsUrl
  }
}

export class GatewayError extends Error {
  readonly code = "gateway_error" as const
  readonly rawPreview?: string
  constructor(message: string, rawPreview?: string) {
    super(message)
    this.name = "GatewayError"
    this.rawPreview = rawPreview
  }
}

export class LlmNetworkError extends Error {
  readonly code = "llm_network_error" as const
  constructor(message = "Could not reach helpbase.dev") {
    super(message)
    this.name = "LlmNetworkError"
  }
}

/** Union of every LLM-proxy error class. */
export type LlmClientError =
  | AuthRequiredError
  | QuotaExceededError
  | GlobalCapError
  | GatewayError
  | LlmNetworkError

/**
 * Helper for CLI callers who want quota info post-success (for the inline
 * "used X tokens (Y%)" suffix). Kept here so both the shared client and
 * consumers share the shape.
 */
export function formatQuotaSuffix(q: WireQuotaStatus): string {
  const pct = Math.round((q.usedToday / q.dailyLimit) * 100)
  const human = humanTokens(q.usedToday)
  const reset = humanUntil(q.resetAt)
  return `used: ${human} tokens (${pct}% of today, resets in ${reset})`
}

export function humanTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function humanUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return "now"
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h >= 1) return `${h}h ${m}m`
  return `${m}m`
}
