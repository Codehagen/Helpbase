import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { generateText } from "ai"
import type {
  GenerateTextRequest,
  GenerateTextResponse,
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
 * POST /api/v1/llm/generate-text
 *
 * Auth: Bearer <supabase session accessToken>.
 * Body: { model, prompt?, messages?, maxOutputTokens? }
 * Return: { text, usage, quota }
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await withAuthAndQuota(req)
  if (gate instanceof NextResponse) return gate
  const { userId, resetAtIso, maxOutputTokens: remainingBudget } = gate

  let body: GenerateTextRequest
  try {
    body = (await req.json()) as GenerateTextRequest
  } catch {
    return wireError(400, "bad_request", "Request body is not valid JSON.")
  }

  if (!body.model || typeof body.model !== "string") {
    return wireError(400, "bad_request", "Missing required field: `model` (string).")
  }
  if (!body.prompt && !body.messages) {
    return wireError(400, "bad_request", "Provide either `prompt` or `messages`.")
  }

  const requested = body.maxOutputTokens ?? PER_CALL_CEILING
  const maxOutputTokens = Math.min(requested, remainingBudget)

  const t0 = Date.now()
  let text: string
  let sdkUsage: unknown
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type GenTextArgs = Parameters<typeof generateText>[0] & { messages?: any; prompt?: any }
    const args: GenTextArgs = body.messages
      ? ({ model: body.model, messages: body.messages, maxOutputTokens } as GenTextArgs)
      : ({ model: body.model, prompt: body.prompt!, maxOutputTokens } as GenTextArgs)
    const result = await generateText(args)
    text = result.text
    sdkUsage = result.usage
  } catch (err) {
    const latency = Date.now() - t0
    const message = err instanceof Error ? err.message : "Unknown gateway error"
    await logUsageEvent({
      userId,
      route: "generate-text",
      model: body.model,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      status: "gateway_error",
      latencyMs: latency,
    })
    return wireError(502, "gateway_error", "The LLM provider returned an error.", {
      rawPreview: message.slice(0, 500),
    })
  }

  const latency = Date.now() - t0
  const usage = wireUsageFromSdk(sdkUsage, 0)

  await logUsageEvent({
    userId,
    route: "generate-text",
    model: body.model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    costUsd: usage.costUsd,
    status: "ok",
    latencyMs: latency,
  })

  const resp: GenerateTextResponse = {
    text,
    usage,
    quota: quotaSnapshot(gate.usedToday + usage.totalTokens, resetAtIso),
  }
  return NextResponse.json(resp)
}
