import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the Better Auth instance: auth.api.getSession(opts) → session | null.
// The route under test imports `auth` from @/lib/auth; our mock short-
// circuits that without needing a DB pool or Resend client.
const mockGetSession = vi.fn<(args: { headers: Headers }) => Promise<
  | { user: { id: string; email: string | null } }
  | null
>>()
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}))

// Mock Supabase service-role client so RPC calls return deterministic values
// without hitting the live DB.
const mockRpc = vi.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>()
vi.mock("@/lib/supabase-admin", () => ({
  getServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  }),
}))

const { withAuthAndQuota } = await import("../app/api/v1/llm/_shared.js")

beforeEach(() => {
  mockGetSession.mockReset()
  mockRpc.mockReset()
})

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/llm/generate-text", { headers })
}

describe("withAuthAndQuota — Better Auth swap", () => {
  it("returns 401 when getSession returns null (no bearer / expired)", async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const result = await withAuthAndQuota(makeRequest())
    expect("status" in result && result.status).toBe(401)
    const body = await (result as Response).json()
    expect(body.error).toBe("auth_required")
  })

  it("returns 401 when getSession resolves without a user id", async () => {
    // Malformed session — user object missing id
    mockGetSession.mockResolvedValueOnce({ user: { id: "", email: null } })
    const result = await withAuthAndQuota(makeRequest({ authorization: "Bearer garbage" }))
    expect("status" in result && result.status).toBe(401)
  })

  it("passes the session's user.id to get_user_tokens_today (text, not uuid)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "7a0f0ad0-text-id", email: "x@y.com" } })
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_user_tokens_today") return Promise.resolve({ data: 1000, error: null })
      if (name === "get_global_tokens_today") return Promise.resolve({ data: 1_000_000, error: null })
      return Promise.resolve({ data: null, error: { message: "unknown rpc" } })
    })
    const result = await withAuthAndQuota(makeRequest({ authorization: "Bearer valid" }))
    expect("userId" in result && result.userId).toBe("7a0f0ad0-text-id")
    // RPC was called with the text userId (not a uuid object) — proves
    // the 2026-04-17 rpc signature change is honored end-to-end.
    expect(mockRpc).toHaveBeenCalledWith("get_user_tokens_today", {
      p_user_id: "7a0f0ad0-text-id",
    })
  })

  it("returns 429 quota_exceeded when user is over the daily cap", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "u1", email: "x@y.com" } })
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_user_tokens_today") return Promise.resolve({ data: 600_000, error: null })
      return Promise.resolve({ data: 0, error: null })
    })
    const result = await withAuthAndQuota(makeRequest({ authorization: "Bearer valid" }))
    expect("status" in result && result.status).toBe(429)
    const body = await (result as Response).json()
    expect(body.error).toBe("quota_exceeded")
  })

  it("returns 503 when the RPC fails (fails-closed on DB errors)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "u1", email: "x@y.com" } })
    mockRpc.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB down" } }),
    )
    const result = await withAuthAndQuota(makeRequest({ authorization: "Bearer valid" }))
    expect("status" in result && result.status).toBe(503)
  })
})
