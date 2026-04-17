import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { generateObject, jsonSchema } from "ai"
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
// `dynamic = "force-dynamic"` only disables static optimization — it does NOT
// raise Vercel's 4.5 MB request body cap. Multimodal requests with large
// base64 images will still 413 at the edge. If that becomes a real problem,
// move image upload to a signed-URL flow (TODO) rather than trying to extend
// the body cap here.
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
  const hasMessages = Array.isArray(body.messages) && body.messages.length > 0
  if (!body.prompt && !hasMessages) {
    return wireError(400, "bad_request", "Provide either `prompt` or a non-empty `messages` array.")
  }

  // Clamp requested cap to the per-call ceiling AND to the remaining budget.
  const requested = body.maxOutputTokens ?? PER_CALL_CEILING
  const maxOutputTokens = Math.min(requested, remainingBudget)
  if (maxOutputTokens <= 0) {
    return wireError(429, "quota_exceeded", "Daily free-tier token quota reached.")
  }

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
      // Pass the client's JSON Schema straight through via Vercel AI SDK's
      // `jsonSchema()` helper. The CLI sends a JSON Schema (from Zod v4's
      // `z.toJSONSchema`), and the model is best guided by the full schema,
      // not `z.any()`. The CLI re-parses the response with its own Zod
      // schema before handing objects to commands, so we get defense-in-depth
      // without needing a JSON-Schema→Zod compiler on the server.
      schema: jsonSchema(body.schema as Parameters<typeof jsonSchema>[0]),
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

