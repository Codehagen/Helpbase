import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { z } from "zod"
import {
  AuthRequiredError,
  GlobalCapError,
  LlmNetworkError,
  QuotaExceededError,
  GatewayError,
} from "../llm-errors.js"
import {
  callLlmObject,
  callLlmText,
  fetchUsageToday,
  getActiveByokKey,
  isByokMode,
  resolveByokModel,
  resolveProxyBase,
} from "../llm.js"
import type { WireErrorBody, WireQuotaStatus } from "../llm-wire.js"

/**
 * Unit tests for packages/shared/src/llm.ts.
 *
 * Covers: BYOK branch detection, all hosted error mappings, happy path
 * shape, network error wrapping. The Vercel AI SDK is mocked so no real
 * calls go out.
 */

// Capture fetch calls so we can assert headers + bodies.
let fetchMock: ReturnType<typeof vi.fn>
const originalFetch = globalThis.fetch

beforeEach(() => {
  delete process.env.AI_GATEWAY_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.HELPBASE_PROXY_URL
  fetchMock = vi.fn()
  // @ts-expect-error vitest-level override
  globalThis.fetch = fetchMock
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ── Config ─────────────────────────────────────────────────────────

describe("resolveProxyBase", () => {
  it("defaults to helpbase.dev", () => {
    expect(resolveProxyBase()).toBe("https://helpbase.dev")
  })

  it("honors HELPBASE_PROXY_URL override", () => {
    process.env.HELPBASE_PROXY_URL = "https://preview.example.com/"
    expect(resolveProxyBase()).toBe("https://preview.example.com")
  })
})

describe("isByokMode", () => {
  it("false when no env var", () => {
    expect(isByokMode()).toBe(false)
  })

  it("true when AI_GATEWAY_API_KEY set", () => {
    process.env.AI_GATEWAY_API_KEY = "vck_test"
    expect(isByokMode()).toBe(true)
  })

  it("true when ANTHROPIC_API_KEY set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    expect(isByokMode()).toBe(true)
  })

  it("true when OPENAI_API_KEY set", () => {
    process.env.OPENAI_API_KEY = "sk-test"
    expect(isByokMode()).toBe(true)
  })

  it("treats empty-string env var as unset (not BYOK)", () => {
    // Shell `export FOO=""` or a quoted `.env` line yields "" in process.env.
    // Without normalization `Boolean("")` is false, which is correct — pin it.
    process.env.AI_GATEWAY_API_KEY = ""
    process.env.ANTHROPIC_API_KEY = ""
    process.env.OPENAI_API_KEY = ""
    expect(isByokMode()).toBe(false)
  })

  it("treats whitespace-only env var as unset (not BYOK)", () => {
    // `export FOO=" "` yields " " which is truthy. Pre-normalization this
    // would flip to BYOK mode and route to the SDK with a whitespace key,
    // producing a cryptic 401. After normalization: unset.
    process.env.ANTHROPIC_API_KEY = "   "
    expect(isByokMode()).toBe(false)
  })
})

describe("getActiveByokKey", () => {
  it("returns undefined when no BYOK key is set", () => {
    expect(getActiveByokKey()).toBeUndefined()
  })

  it("returns AI_GATEWAY_API_KEY when set", () => {
    process.env.AI_GATEWAY_API_KEY = "vck_test"
    expect(getActiveByokKey()).toBe("AI_GATEWAY_API_KEY")
  })

  it("returns ANTHROPIC_API_KEY when Gateway unset but Anthropic set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    expect(getActiveByokKey()).toBe("ANTHROPIC_API_KEY")
  })

  it("returns OPENAI_API_KEY when only OpenAI set", () => {
    process.env.OPENAI_API_KEY = "sk-test"
    expect(getActiveByokKey()).toBe("OPENAI_API_KEY")
  })

  it("respects Gateway > Anthropic > OpenAI precedence", () => {
    process.env.AI_GATEWAY_API_KEY = "vck_test"
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    process.env.OPENAI_API_KEY = "sk-test"
    expect(getActiveByokKey()).toBe("AI_GATEWAY_API_KEY")
  })

  it("treats whitespace env var as unset in precedence", () => {
    process.env.AI_GATEWAY_API_KEY = "  "
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    expect(getActiveByokKey()).toBe("ANTHROPIC_API_KEY")
  })
})

describe("resolveByokModel — provider routing", () => {
  it("returns the raw model string when Gateway key is set (accepts any provider)", () => {
    process.env.AI_GATEWAY_API_KEY = "vck_test"
    expect(resolveByokModel("google/gemini-3.1-flash-lite-preview")).toBe(
      "google/gemini-3.1-flash-lite-preview",
    )
    expect(resolveByokModel("anthropic/claude-3-5-sonnet-latest")).toBe(
      "anthropic/claude-3-5-sonnet-latest",
    )
  })

  it("Gateway wins over Anthropic when both are set", () => {
    process.env.AI_GATEWAY_API_KEY = "vck_test"
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    // String pass-through proves the Gateway branch was taken — the
    // Anthropic branch would have returned an SDK object instead.
    expect(typeof resolveByokModel("google/gemini-3.1-flash-lite-preview")).toBe("string")
  })

  it("returns an anthropic model object when ANTHROPIC_API_KEY + anthropic/ model", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    const model = resolveByokModel("anthropic/claude-3-5-sonnet-latest")
    expect(typeof model).toBe("object")
  })

  it("throws when ANTHROPIC_API_KEY is set but model is not anthropic/", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    expect(() => resolveByokModel("google/gemini-3.1-flash-lite-preview")).toThrow(
      /ANTHROPIC_API_KEY is set/,
    )
    expect(() => resolveByokModel("openai/gpt-4o")).toThrow(/ANTHROPIC_API_KEY is set/)
  })

  it("returns an openai model object when OPENAI_API_KEY + openai/ model", () => {
    process.env.OPENAI_API_KEY = "sk-test"
    const model = resolveByokModel("openai/gpt-4o-mini")
    expect(typeof model).toBe("object")
  })

  it("throws when OPENAI_API_KEY is set but model is not openai/", () => {
    process.env.OPENAI_API_KEY = "sk-test"
    expect(() => resolveByokModel("google/gemini-3.1-flash-lite-preview")).toThrow(
      /OPENAI_API_KEY is set/,
    )
  })

  it("Anthropic wins over OpenAI when both are set but Gateway isn't", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    process.env.OPENAI_API_KEY = "sk-test"
    // anthropic/ model works; openai/ throws (because Anthropic branch is taken)
    expect(typeof resolveByokModel("anthropic/claude-3-5-sonnet-latest")).toBe("object")
    expect(() => resolveByokModel("openai/gpt-4o")).toThrow(/ANTHROPIC_API_KEY is set/)
  })

  it("throws clearly when called with no BYOK key (should not happen in practice)", () => {
    expect(() => resolveByokModel("anthropic/claude-3-5-sonnet-latest")).toThrow(
      /without any BYOK key/,
    )
  })

  it("rejects empty model id after the provider slash", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    expect(() => resolveByokModel("anthropic/")).toThrow(/ANTHROPIC_API_KEY is set/)
    expect(() => resolveByokModel("anthropic")).toThrow(/ANTHROPIC_API_KEY is set/)
  })

  it("tolerates leading/trailing whitespace in the model string", () => {
    // Users who shell-quote `--model " anthropic/claude-..."` shouldn't hit
    // a confusing "provider mismatch" error.
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    expect(typeof resolveByokModel("  anthropic/claude-3-5-sonnet-latest  ")).toBe("object")
  })

  it("is case-insensitive on the provider prefix", () => {
    // `Anthropic/...` and `ANTHROPIC/...` are the same user intent as
    // `anthropic/...`. Previously threw a confusing provider-mismatch.
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    expect(typeof resolveByokModel("Anthropic/claude-3-5-sonnet-latest")).toBe("object")
    expect(typeof resolveByokModel("ANTHROPIC/claude-3-5-sonnet-latest")).toBe("object")
  })

  it("strips Gateway-path whitespace on pass-through", () => {
    process.env.AI_GATEWAY_API_KEY = "vck_test"
    // Gateway path returns the trimmed string so the SDK doesn't 404 on
    // "  google/gemini-...".
    expect(resolveByokModel("  google/gemini-3.1-flash-lite-preview  ")).toBe(
      "google/gemini-3.1-flash-lite-preview",
    )
  })
})

// ── Hosted path: error mapping ─────────────────────────────────────

describe("callLlmObject hosted path — error mapping", () => {
  const schema = z.object({ ok: z.boolean() })

  function mockResponse(status: number, body: WireErrorBody | Record<string, unknown>) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      json: async () => body,
    } as unknown as Response)
  }

  it("throws AuthRequiredError when no authToken is passed", async () => {
    await expect(
      callLlmObject({ model: "x/y", prompt: "p", schema }),
    ).rejects.toBeInstanceOf(AuthRequiredError)
  })

  it("throws AuthRequiredError on 401", async () => {
    mockResponse(401, { error: "auth_required", message: "Invalid token" })
    await expect(
      callLlmObject({ model: "x/y", prompt: "p", schema, authToken: "bad" }),
    ).rejects.toBeInstanceOf(AuthRequiredError)
  })

  it("throws QuotaExceededError on 429 with quota fields", async () => {
    mockResponse(429, {
      error: "quota_exceeded",
      message: "capped",
      usedToday: 500_000,
      dailyLimit: 500_000,
      resetAt: "2026-04-18T00:00:00Z",
      upgradeUrl: "https://helpbase.dev/waitlist",
      byokDocsUrl: "https://helpbase.dev/guides/byok",
    })
    try {
      await callLlmObject({ model: "x/y", prompt: "p", schema, authToken: "ok" })
      throw new Error("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaExceededError)
      const q = err as QuotaExceededError
      expect(q.usedToday).toBe(500_000)
      expect(q.dailyLimit).toBe(500_000)
      expect(q.upgradeUrl).toBe("https://helpbase.dev/waitlist")
    }
  })

  it("throws GlobalCapError on 503 global_cap_hit", async () => {
    mockResponse(503, {
      error: "global_cap_hit",
      message: "global",
      resetAt: "2026-04-18T00:00:00Z",
      byokDocsUrl: "https://helpbase.dev/guides/byok",
    })
    await expect(
      callLlmObject({ model: "x/y", prompt: "p", schema, authToken: "ok" }),
    ).rejects.toBeInstanceOf(GlobalCapError)
  })

  it("throws GatewayError on 502", async () => {
    mockResponse(502, { error: "gateway_error", message: "upstream 500", rawPreview: "…" })
    await expect(
      callLlmObject({ model: "x/y", prompt: "p", schema, authToken: "ok" }),
    ).rejects.toBeInstanceOf(GatewayError)
  })

  it("wraps fetch rejections as LlmNetworkError", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    await expect(
      callLlmObject({ model: "x/y", prompt: "p", schema, authToken: "ok" }),
    ).rejects.toBeInstanceOf(LlmNetworkError)
  })

  it("returns object + usage + quota on 200", async () => {
    const quota: WireQuotaStatus = {
      usedToday: 1234,
      dailyLimit: 500_000,
      resetAt: "2026-04-18T00:00:00Z",
    }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      json: async () => ({
        object: { ok: true },
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, costUsd: 0 },
        quota,
      }),
    } as unknown as Response)
    const out = await callLlmObject({
      model: "x/y",
      prompt: "p",
      schema,
      authToken: "tkn",
    })
    expect(out.object).toEqual({ ok: true })
    expect(out.usage?.totalTokens).toBe(30)
    expect(out.quota?.usedToday).toBe(1234)
  })

  it("sends Bearer token in Authorization header", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      json: async () => ({
        object: { ok: true },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 },
        quota: { usedToday: 0, dailyLimit: 500_000, resetAt: "2026-04-18T00:00:00Z" },
      }),
    } as unknown as Response)
    await callLlmObject({ model: "x/y", prompt: "p", schema, authToken: "my-tkn" })
    const call = fetchMock.mock.calls[0]!
    const init = call[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer my-tkn")
  })
})

// ── Hosted path: text mode ─────────────────────────────────────────

describe("callLlmText hosted path", () => {
  it("returns text on 200", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      json: async () => ({
        text: "hello world",
        usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7, costUsd: 0 },
        quota: { usedToday: 7, dailyLimit: 500_000, resetAt: "2026-04-18T00:00:00Z" },
      }),
    } as unknown as Response)
    const out = await callLlmText({ model: "x/y", prompt: "hi", authToken: "tkn" })
    expect(out.text).toBe("hello world")
  })

  it("throws AuthRequiredError with no token", async () => {
    await expect(
      callLlmText({ model: "x/y", prompt: "hi" }),
    ).rejects.toBeInstanceOf(AuthRequiredError)
  })
})

// ── fetchUsageToday ────────────────────────────────────────────────

describe("fetchUsageToday", () => {
  it("returns parsed quota on 200", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      json: async () => ({
        email: "me@example.com",
        quota: { usedToday: 99, dailyLimit: 500_000, resetAt: "2026-04-18T00:00:00Z" },
      }),
    } as unknown as Response)
    const out = await fetchUsageToday("tkn")
    expect(out.email).toBe("me@example.com")
    expect(out.quota.usedToday).toBe(99)
  })

  it("throws AuthRequiredError on 401", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "",
      json: async () => ({}),
    } as unknown as Response)
    await expect(fetchUsageToday("bad")).rejects.toBeInstanceOf(AuthRequiredError)
  })

  it("wraps network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("EAI_AGAIN"))
    await expect(fetchUsageToday("tkn")).rejects.toBeInstanceOf(LlmNetworkError)
  })
})
