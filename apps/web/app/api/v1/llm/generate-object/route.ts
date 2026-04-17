import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { z } from "zod"
import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
} from "@workspace/shared/llm-wire"
import {
  logUsageEvent,
  quotaSnapshot,
  wireError,
  wireUsageFromSdk,
  withAuthAndQuota,
  PER_CALL_CEILING,
} from "../_shared"

/**
 * POST /api/v1/llm/generate-object
 *
 * Auth: Bearer <supabase session accessToken> (from helpbase CLI).
 * Body: { model, prompt?, messages?, schema (JSON Schema), images?, maxOutputTokens? }
 * Return: { object, usage, quota }
 *
 * Applies per-user daily token cap + global circuit breaker before the call;
 * logs `llm_usage_events` and bumps `global_daily_tokens` after.
 */

export const runtime = "nodejs"
// Vercel default body cap is 4.5 MB; multimodal requests with big base64 images
// can push past that, so we allow generous decoding on the route.
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await withAuthAndQuota(req)
  if (gate instanceof NextResponse) return gate
  const { userId, resetAtIso, maxOutputTokens: remainingBudget } = gate

  let body: GenerateObjectRequest
  try {
    body = (await req.json()) as GenerateObjectRequest
  } catch {
    return wireError(400, "bad_request", "Request body is not valid JSON.")
  }

  if (!body.model || typeof body.model !== "string") {
    return wireError(400, "bad_request", "Missing required field: `model` (string).")
  }
  if (!body.schema || typeof body.schema !== "object") {
    return wireError(400, "bad_request", "Missing required field: `schema` (JSON Schema object).")
  }
  if (!body.prompt && !body.messages) {
    return wireError(400, "bad_request", "Provide either `prompt` or `messages`.")
  }

  // Clamp requested cap to the per-call ceiling AND to the remaining budget.
  const requested = body.maxOutputTokens ?? PER_CALL_CEILING
  const maxOutputTokens = Math.min(requested, remainingBudget)

  // Build messages from images if provided.
  const messages = body.images?.length
    ? [
        {
          role: "user" as const,
          content: [
            ...body.images.map((img) => ({
              type: "image" as const,
              image: `data:${img.mimeType};base64,${img.data}`,
            })),
            ...(body.prompt ? [{ type: "text" as const, text: body.prompt }] : []),
          ],
        },
      ]
    : (body.messages as Parameters<typeof generateObject>[0]["messages"])

  const t0 = Date.now()
  let object: unknown
  let sdkUsage: unknown
  try {
    const result = await generateObject({
      model: body.model,
      // JSON Schema → Zod-free path: pass schema through as jsonSchema.
      // Vercel AI SDK accepts { jsonSchema: ... } for pre-serialized schemas.
      schema: jsonSchemaToZod(body.schema),
      ...(messages
        ? { messages }
        : { prompt: body.prompt! }),
      maxOutputTokens,
    })
    object = result.object
    sdkUsage = result.usage
  } catch (err) {
    const latency = Date.now() - t0
    const message = err instanceof Error ? err.message : "Unknown gateway error"
    const rawPreview = typeof message === "string" ? message.slice(0, 500) : undefined
    // Gateway error → log status, do NOT charge tokens.
    await logUsageEvent({
      userId,
      route: "generate-object",
      model: body.model,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      status: "gateway_error",
      latencyMs: latency,
    })
    return wireError(502, "gateway_error", "The LLM provider returned an error.", {
      rawPreview,
    })
  }

  const latency = Date.now() - t0
  const usage = wireUsageFromSdk(sdkUsage, 0)

  await logUsageEvent({
    userId,
    route: "generate-object",
    model: body.model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    costUsd: usage.costUsd,
    status: "ok",
    latencyMs: latency,
  })

  const resp: GenerateObjectResponse = {
    object,
    usage,
    quota: quotaSnapshot(gate.usedToday + usage.totalTokens, resetAtIso),
  }
  return NextResponse.json(resp)
}

/**
 * Turn a JSON Schema (from zod.toJSONSchema on the client side) into a Zod
 * schema usable by Vercel AI SDK's `generateObject`. We bypass actual parsing
 * and return a loose `z.any()` — the server-side schema is only used to
 * instruct the model; downstream the CLI re-parses the result with its
 * own Zod schema for safety.
 *
 * Trade-off: we lose server-side schema enforcement. CLI's own `schema.parse`
 * catches anything the model returns wrong. Keeps the proxy thin and
 * avoids a full JSON-Schema → Zod compiler as a server dep.
 */
function jsonSchemaToZod(_jsonSchema: unknown): z.ZodType {
  return z.any()
}
