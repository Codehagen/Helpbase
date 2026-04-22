/**
 * Wire contract between the helpbase CLI and /api/v1/llm/* routes.
 *
 * Versioned from day 1. Breaking changes ship under /api/v2/* alongside /v1/.
 * Older CLI installs keep pointing at /v1/ indefinitely.
 *
 * Imported by BOTH sides:
 *   - CLI: packages/shared/src/llm.ts (builds the request, parses the response)
 *   - Server: apps/web/app/api/v1/llm/(generate-object|generate-text)/route.ts
 *
 * Keep this file pure types + tiny value constants. No runtime deps, no ai-sdk
 * imports. Both environments pay this cost, so it has to stay tiny.
 */

export const LLM_API_VERSION = "v1" as const

/** Path prefix for the proxy. CLI appends `/generate-object` etc. */
export const LLM_API_BASE_PATH = `/api/${LLM_API_VERSION}/llm` as const

/** Path for the usage endpoint consumed by `helpbase whoami`. */
export const USAGE_API_PATH = `/api/${LLM_API_VERSION}/usage/today` as const

// ── Request shapes ──────────────────────────────────────────────────────

/**
 * An image in a multimodal request. Same shape as Vercel AI SDK.
 * Kept inline so the wire contract doesn't pull in the ai-sdk package.
 */
export interface WireImage {
  mimeType: string
  /** Base64-encoded data, no `data:` prefix. */
  data: string
}

/**
 * POST /api/v1/llm/generate-object
 *
 * Structured-output generation. Server runs Vercel AI SDK `generateObject` with
 * the provided JSON schema. `schema` is the Zod schema serialized via the
 * project's existing zod-to-json-schema pipeline, or a Vercel-compatible JSON
 * Schema — the server decides at decode time.
 */
export interface GenerateObjectRequest {
  model: string
  prompt?: string
  messages?: unknown
  /** JSON Schema object (from zod.toJSONSchema or equivalent). */
  schema: unknown
  images?: WireImage[]
  /**
   * Upper bound on output tokens for this single call. Server MAY clamp lower
   * to fit remaining quota — see the 100k per-call ceiling in the plan.
   */
  maxOutputTokens?: number
}

/**
 * POST /api/v1/llm/generate-text
 *
 * Unstructured-output generation. Server runs Vercel AI SDK `generateText`.
 */
export interface GenerateTextRequest {
  model: string
  prompt?: string
  messages?: unknown
  maxOutputTokens?: number
}

// ── Success shape ───────────────────────────────────────────────────────

/**
 * Per-call token + cost accounting. Mirrors the Vercel AI SDK's `usage` field,
 * with `cost_usd` added from the Gateway's metadata (0 if unavailable).
 */
export interface WireUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
}

/** Daily-quota snapshot returned on every 200 response. Drives CLI warnings. */
export interface WireQuotaStatus {
  /** Tokens used today by this user, AFTER this call is logged. */
  usedToday: number
  /** Daily token cap for this user (free tier: 500,000). */
  dailyLimit: number
  /** ISO 8601 instant when the daily counter resets (next UTC midnight). */
  resetAt: string
}

export interface GenerateObjectResponse {
  object: unknown
  usage: WireUsage
  quota: WireQuotaStatus
}

export interface GenerateTextResponse {
  text: string
  usage: WireUsage
  quota: WireQuotaStatus
}

// ── GET /api/v1/usage/today ─────────────────────────────────────────────

export interface UsageTodayResponse {
  email: string
  quota: WireQuotaStatus
}

// ── Error envelope ──────────────────────────────────────────────────────

/**
 * All non-2xx responses from /api/v1/llm/* use this envelope.
 * CLI maps `error` to a specific error class (see packages/shared/src/llm-errors.ts).
 */
export interface WireErrorBody {
  error: WireErrorCode
  message: string
  /** Present on quota_exceeded and global_cap_hit. */
  resetAt?: string
  /** Present on quota_exceeded. */
  usedToday?: number
  /** Present on quota_exceeded. */
  dailyLimit?: number
  /** Present on quota_exceeded and global_cap_hit — where the user goes next. */
  upgradeUrl?: string
  byokDocsUrl?: string
  /** Present on gateway_error — short raw preview for debugging. */
  rawPreview?: string
}

export type WireErrorCode =
  | "auth_required"
  | "quota_exceeded"
  | "global_cap_hit"
  | "gateway_error"
  | "schema_error"
  | "bad_request"
  | "payload_too_large"
  | "internal_error"
  // CI / GitHub Actions OIDC auth lane — v0.8+
  | "oidc_invalid"
  | "oidc_wrong_audience"
  | "ci_quota_exceeded"

/** URL that CLI 429 messages point at. Ships statically in the web app. */
export const UPGRADE_URL = "https://helpbase.dev/waitlist" as const

/** URL that BYOK hints in errors point at. */
export const BYOK_DOCS_URL = "https://helpbase.dev/guides/byok" as const
