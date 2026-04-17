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
  isByokMode,
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
      byokDocsUrl: "https://helpbase.dev/docs/byok",
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
      byokDocsUrl: "https://helpbase.dev/docs/byok",
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
