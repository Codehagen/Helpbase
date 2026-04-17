import { generateObject, generateText, type LanguageModel } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"
import {
  LLM_API_BASE_PATH,
  USAGE_API_PATH,
  type GenerateObjectRequest,
  type GenerateObjectResponse,
  type GenerateTextRequest,
  type GenerateTextResponse,
  type UsageTodayResponse,
  type WireErrorBody,
  type WireImage,
  type WireQuotaStatus,
  type WireUsage,
} from "./llm-wire.js"
import {
  AuthRequiredError,
  GatewayError,
  GlobalCapError,
  LlmNetworkError,
  QuotaExceededError,
} from "./llm-errors.js"

/**
 * One entry point for every LLM call the CLI + scaffolder make.
 *
 *   ┌─ AI_GATEWAY_API_KEY set?   → Vercel AI Gateway (any provider)
 *   ├─ ANTHROPIC_API_KEY set?    → @ai-sdk/anthropic direct, requires anthropic/ model
 *   ├─ OPENAI_API_KEY set?       → @ai-sdk/openai direct, requires openai/ model
 *   └─ else                      → POST helpbase.dev/api/v1/llm/* (hosted, quota-gated)
 *
 * The hosted path applies per-user quota + global circuit breaker server-side.
 * BYOK skips both — the user eats their own cost against their own key.
 *
 * Auth: hosted path requires a bearer token from the CLI's session (see
 * packages/cli/src/lib/auth.ts::getCurrentSession). BYOK path ignores the
 * token entirely.
 *
 * Both paths return the same shape so call sites don't branch on mode.
 */

// ── Config ─────────────────────────────────────────────────────────────

/** Proxy base URL. Override with HELPBASE_PROXY_URL for staging/local dev. */
export function resolveProxyBase(): string {
  return process.env.HELPBASE_PROXY_URL?.replace(/\/$/, "") ?? "https://helpbase.dev"
}

/** True when we should bypass the proxy — any provider key counts as BYOK. */
export function isByokMode(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY,
  )
}

/**
 * Resolve which BYOK path to use, in priority order. Called only inside the
 * BYOK branch — i.e. `isByokMode()` was already true. Returns the model
 * factory to pass into the Vercel AI SDK, or throws a clear error when the
 * user's key + model combination can't be satisfied without a signup.
 *
 * Precedence: Gateway > Anthropic > OpenAI.
 *
 * When Anthropic/OpenAI is set but the caller's model string doesn't match
 * that provider (e.g. `google/gemini-...` while only ANTHROPIC_API_KEY is
 * set), we throw an explicit error instead of silently routing to Gateway,
 * because Gateway isn't configured and a "no key" error would be confusing.
 */
export function resolveByokModel(modelString: string): LanguageModel | string {
  // Gateway wins: it accepts any provider-prefixed model string directly.
  if (process.env.AI_GATEWAY_API_KEY) {
    return modelString
  }

  const [provider, ...rest] = modelString.split("/")
  const modelId = rest.join("/")

  if (process.env.ANTHROPIC_API_KEY) {
    if (provider !== "anthropic" || !modelId) {
      throw new GatewayError(
        `ANTHROPIC_API_KEY is set but the model is "${modelString}". ` +
          `Pass an anthropic/ model via --model (e.g. ` +
          `"anthropic/claude-3-5-sonnet-latest"), or set AI_GATEWAY_API_KEY ` +
          `to use any provider.`,
      )
    }
    return anthropic(modelId)
  }

  if (process.env.OPENAI_API_KEY) {
    if (provider !== "openai" || !modelId) {
      throw new GatewayError(
        `OPENAI_API_KEY is set but the model is "${modelString}". ` +
          `Pass an openai/ model via --model (e.g. "openai/gpt-4o-mini"), ` +
          `or set AI_GATEWAY_API_KEY to use any provider.`,
      )
    }
    return openai(modelId)
  }

  // Should be unreachable — callers gate on isByokMode() first. If the gate
  // drifts, fail loudly rather than leaving the SDK to emit a cryptic
  // "No API key" deep in its stack.
  throw new GatewayError(
    "resolveByokModel called without any BYOK key set — this is a bug.",
  )
}

// ── Public: object mode ────────────────────────────────────────────────

export interface CallLlmObjectOptions<T> {
  model: string
  prompt: string
  schema: z.ZodType<T>
  images?: WireImage[]
  /** Hosted path only — CLI passes session.accessToken. */
  authToken?: string
  /** Cap output tokens for this single call. Server may clamp to fit quota. */
  maxOutputTokens?: number
}

export interface LlmObjectResult<T> {
  object: T
  /** Only present on hosted path. BYOK calls do not return usage. */
  usage?: WireUsage
  quota?: WireQuotaStatus
}

export async function callLlmObject<T>(opts: CallLlmObjectOptions<T>): Promise<LlmObjectResult<T>> {
  if (isByokMode()) {
    const object = await byokGenerateObject(opts)
    return { object }
  }
  return hostedGenerateObject(opts)
}

// ── Public: text mode ──────────────────────────────────────────────────

export interface CallLlmTextOptions {
  model: string
  prompt?: string
  messages?: unknown
  authToken?: string
  maxOutputTokens?: number
}

export interface LlmTextResult {
  text: string
  usage?: WireUsage
  quota?: WireQuotaStatus
}

export async function callLlmText(opts: CallLlmTextOptions): Promise<LlmTextResult> {
  if (isByokMode()) {
    const text = await byokGenerateText(opts)
    return { text }
  }
  return hostedGenerateText(opts)
}

// ── Public: usage endpoint ────────────────────────────────────────────

/**
 * Fetch the signed-in user's quota snapshot for `helpbase whoami`.
 * Never used on BYOK path — BYOK users don't have a helpbase quota.
 */
export async function fetchUsageToday(authToken: string): Promise<UsageTodayResponse> {
  const url = `${resolveProxyBase()}${USAGE_API_PATH}`
  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${authToken}` },
    })
  } catch (err) {
    throw new LlmNetworkError(
      `Could not reach ${resolveProxyBase()} (${err instanceof Error ? err.message : String(err)})`,
    )
  }
  if (res.status === 401) throw new AuthRequiredError()
  if (!res.ok) {
    throw new GatewayError(`usage endpoint returned ${res.status}`)
  }
  return (await res.json()) as UsageTodayResponse
}

// ── BYOK path ──────────────────────────────────────────────────────────

async function byokGenerateObject<T>({
  model,
  prompt,
  schema,
  images,
  maxOutputTokens,
}: CallLlmObjectOptions<T>): Promise<T> {
  const resolved = resolveByokModel(model)
  const messages = images?.length
    ? [
        {
          role: "user" as const,
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              image: `data:${img.mimeType};base64,${img.data}`,
            })),
            { type: "text" as const, text: prompt },
          ],
        },
      ]
    : undefined

  try {
    if (messages) {
      const { object } = await generateObject({
        model: resolved,
        schema,
        messages,
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
      })
      return object as T
    }
    const { object } = await generateObject({
      model: resolved,
      schema,
      prompt,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
    })
    return object as T
  } catch (err) {
    // Multimodal schema+image fallback: try generateText + JSON extraction.
    if (images?.length) {
      try {
        const { text } = await generateText({
          model: resolved,
          messages: messages!,
          ...(maxOutputTokens ? { maxOutputTokens } : {}),
        })
        const parsed = extractJsonFromText(text)
        return schema.parse(parsed)
      } catch (fallbackErr) {
        throw new GatewayError(
          fallbackErr instanceof Error ? fallbackErr.message : "Unknown BYOK gateway error",
        )
      }
    }
    throw new GatewayError(err instanceof Error ? err.message : "Unknown BYOK gateway error")
  }
}

async function byokGenerateText({
  model,
  prompt,
  messages,
  maxOutputTokens,
}: CallLlmTextOptions): Promise<string> {
  const resolved = resolveByokModel(model)
  try {
    // Vercel AI SDK requires `prompt` OR `messages` to be present (not both,
    // not neither). Branch explicitly so TS can narrow to a valid overload.
    const cap = maxOutputTokens ? { maxOutputTokens } : {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type GenTextArgs = Parameters<typeof generateText>[0] & { messages?: any; prompt?: any }
    let args: GenTextArgs
    if (messages !== undefined) {
      args = { model: resolved, messages, ...cap } as GenTextArgs
    } else if (prompt !== undefined) {
      args = { model: resolved, prompt, ...cap } as GenTextArgs
    } else {
      throw new GatewayError("callLlmText requires either `prompt` or `messages`")
    }
    const result = await generateText(args)
    return result.text
  } catch (err) {
    throw new GatewayError(err instanceof Error ? err.message : "Unknown BYOK gateway error")
  }
}

// ── Hosted path ────────────────────────────────────────────────────────

async function hostedGenerateObject<T>({
  model,
  prompt,
  schema,
  images,
  authToken,
  maxOutputTokens,
}: CallLlmObjectOptions<T>): Promise<LlmObjectResult<T>> {
  if (!authToken) throw new AuthRequiredError()

  const jsonSchema = zodToJsonSchema(schema)
  const body: GenerateObjectRequest = {
    model,
    prompt,
    schema: jsonSchema,
    ...(images?.length ? { images } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
  }

  const url = `${resolveProxyBase()}${LLM_API_BASE_PATH}/generate-object`
  const res = await fetchJson(url, authToken, body)
  await throwOnWireError(res)
  const parsed = (await res.json()) as GenerateObjectResponse
  // Validate server response against the caller's schema. If the server
  // upstream-validated already, this is a no-op; if not, it's a safety net.
  const object = schema.parse(parsed.object)
  return { object, usage: parsed.usage, quota: parsed.quota }
}

async function hostedGenerateText({
  model,
  prompt,
  messages,
  authToken,
  maxOutputTokens,
}: CallLlmTextOptions): Promise<LlmTextResult> {
  if (!authToken) throw new AuthRequiredError()

  const body: GenerateTextRequest = {
    model,
    ...(prompt !== undefined ? { prompt } : {}),
    ...(messages !== undefined ? { messages } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
  }

  const url = `${resolveProxyBase()}${LLM_API_BASE_PATH}/generate-text`
  const res = await fetchJson(url, authToken, body)
  await throwOnWireError(res)
  const parsed = (await res.json()) as GenerateTextResponse
  return { text: parsed.text, usage: parsed.usage, quota: parsed.quota }
}

async function fetchJson(url: string, authToken: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new LlmNetworkError(
      `Could not reach ${new URL(url).host} (${err instanceof Error ? err.message : String(err)})`,
    )
  }
}

async function throwOnWireError(res: Response): Promise<void> {
  if (res.ok) return
  let body: WireErrorBody | undefined
  try {
    body = (await res.json()) as WireErrorBody
  } catch {
    // Non-JSON error body — synthesize one.
    body = {
      error: "internal_error",
      message: `helpbase returned ${res.status} ${res.statusText}`,
    }
  }

  switch (body.error) {
    case "auth_required":
      throw new AuthRequiredError(body.message)
    case "quota_exceeded":
      throw new QuotaExceededError({
        usedToday: body.usedToday ?? 0,
        dailyLimit: body.dailyLimit ?? 0,
        resetAt: body.resetAt ?? new Date().toISOString(),
        upgradeUrl: body.upgradeUrl ?? "https://helpbase.dev/waitlist",
        byokDocsUrl: body.byokDocsUrl ?? "https://helpbase.dev/docs/byok",
        message: body.message,
      })
    case "global_cap_hit":
      throw new GlobalCapError({
        resetAt: body.resetAt ?? new Date().toISOString(),
        byokDocsUrl: body.byokDocsUrl ?? "https://helpbase.dev/docs/byok",
        message: body.message,
      })
    case "gateway_error":
      throw new GatewayError(body.message, body.rawPreview)
    case "schema_error":
      throw new GatewayError(body.message, body.rawPreview)
    case "bad_request":
    case "payload_too_large":
    case "internal_error":
    default:
      throw new GatewayError(`${body.error}: ${body.message}`)
  }
}

// ── Zod → JSON Schema ─────────────────────────────────────────────────

/**
 * Zod v4 ships z.toJSONSchema natively. Keep this thin wrapper so callers
 * don't have to care about the import shape; also gives one place to swap
 * if we ever move off Zod.
 */
export function zodToJsonSchema(schema: z.ZodType): unknown {
  const maybeFn = (z as unknown as { toJSONSchema?: (s: z.ZodType) => unknown }).toJSONSchema
  if (typeof maybeFn === "function") return maybeFn(schema)
  // Fallback for Zod versions that don't have toJSONSchema: throw, since
  // without a JSON Schema the server can't validate.
  throw new Error(
    "zod.toJSONSchema is not available — upgrade zod to v4+ or swap the shared llm module to accept pre-serialized JSON Schema.",
  )
}

// ── JSON extraction (copied from ai.ts for BYOK multimodal fallback) ───

/**
 * Extract JSON from raw model text output. Used only in the BYOK multimodal
 * fallback where some models return JSON inside markdown fences.
 */
export function extractJsonFromText(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    // continue
  }
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim())
    } catch {
      // continue
    }
  }
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    } catch {
      // continue
    }
  }
  const preview = raw.slice(0, 500)
  throw new GatewayError(`Model returned invalid JSON. Raw: ${preview}`)
}
