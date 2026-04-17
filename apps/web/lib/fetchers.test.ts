import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, fetchJson } from "./fetchers"

describe("fetchJson", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
    return {
      ok,
      status,
      statusText: `HTTP ${status}`,
      json: async () => body,
    } as Response
  }

  it("returns parsed body on 2xx", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse(200, { hello: "world" }))
    const data = await fetchJson<{ hello: string }>("/api/x")
    expect(data).toEqual({ hello: "world" })
  })

  it("forwards same-origin credentials by default", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse(200, {}))
    await fetchJson("/api/x")
    const init = vi.mocked(global.fetch).mock.calls[0]?.[1]
    expect(init?.credentials).toBe("same-origin")
  })

  it("maps 401 with WireErrorBody to ApiError with code", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockResponse(401, { error: "auth_required", message: "Sign in." }),
    )
    const err = await fetchJson("/api/x").catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
    expect((err as ApiError).code).toBe("auth_required")
    expect((err as ApiError).message).toBe("Sign in.")
  })

  it("maps 5xx without parsable body to a generic ApiError", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => {
        throw new Error("not json")
      },
    } as unknown as Response)

    const err = await fetchJson("/api/x").catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(503)
    expect((err as ApiError).code).toBe("http_503")
    expect((err as ApiError).body).toBeNull()
  })

  it("preserves additional fields on WireErrorBody (quota_exceeded)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockResponse(429, {
        error: "quota_exceeded",
        message: "Daily cap hit.",
        usedToday: 10,
        dailyLimit: 10,
        resetAt: "2026-04-18T00:00:00Z",
      }),
    )
    const err = (await fetchJson("/api/x").catch((e) => e)) as ApiError
    expect(err.body?.usedToday).toBe(10)
    expect(err.body?.resetAt).toBe("2026-04-18T00:00:00Z")
  })
})
