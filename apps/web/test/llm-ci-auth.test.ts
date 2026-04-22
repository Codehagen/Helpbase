import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Integration tests for the CI auth lane in _shared.ts.
 *
 * Covers the dispatcher (bearer detection → route to CI vs user) plus
 * withCiAuthAndQuota (OIDC verify + per-repo quota + global cap + log to
 * llm_usage_events_ci). JWT verification itself is exercised with real
 * crypto in oidc-verify.test.ts — here we mock the verifier so tests
 * stay deterministic and fast.
 */

// Mock Better Auth (user lane) so dispatcher doesn't hit a real auth client.
const mockGetSession = vi.fn<(args: { headers: Headers }) => Promise<
  { user: { id: string; email: string | null } } | null
>>()
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}))

// Mock Supabase service-role client. Both RPC calls and table inserts
// route through here.
const mockRpc = vi.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>()
const mockInsert = vi.fn<(row: unknown) => Promise<{ error: unknown }>>()
const mockFrom = vi.fn((_table: string) => ({
  insert: (row: unknown) => mockInsert(row),
}))
vi.mock("@/lib/supabase-admin", () => ({
  getServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => mockFrom(table),
  }),
}))

// Mock the OIDC verifier — crypto correctness is covered in oidc-verify.test.ts.
// Here we just need isGithubOidcToken() to route correctly and
// verifyGithubOidcJwt() to return canned claims.
const mockVerifyOidc = vi.fn<(token: string) => Promise<Record<string, unknown>>>()
const mockIsOidc = vi.fn<(token: string) => boolean>()
vi.mock("@/lib/oidc-verify", async () => {
  const actual = await vi.importActual<typeof import("@/lib/oidc-verify")>(
    "@/lib/oidc-verify",
  )
  return {
    ...actual,
    isGithubOidcToken: (t: string) => mockIsOidc(t),
    verifyGithubOidcJwt: (t: string) => mockVerifyOidc(t),
  }
})

const { withAuthAndQuota, logUsageEvent } = await import(
  "../app/api/v1/llm/_shared.js"
)
const { OidcRejected } = await import("@/lib/oidc-verify")

beforeEach(() => {
  mockGetSession.mockReset()
  mockRpc.mockReset()
  mockInsert.mockReset()
  mockFrom.mockClear()
  mockVerifyOidc.mockReset()
  mockIsOidc.mockReset()
  // Default: inserts succeed
  mockInsert.mockResolvedValue({ error: null })
})

function makeReq(authHeader?: string) {
  return new Request("http://localhost/api/v1/llm/generate-text", {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

const VALID_CLAIMS = {
  repository_id: "888777",
  repository: "acme-corp/docs",
  repository_owner: "acme-corp",
  repository_owner_id: "123",
  event_name: "push",
  ref: "refs/heads/main",
}

describe("withAuthAndQuota — dispatcher routing", () => {
  it("routes GH OIDC tokens to the CI lane", async () => {
    mockIsOidc.mockReturnValue(true)
    mockVerifyOidc.mockResolvedValueOnce(VALID_CLAIMS)
    mockRpc.mockImplementation((name) => {
      if (name === "get_repo_tokens_today") return Promise.resolve({ data: 0, error: null })
      if (name === "get_global_tokens_today") return Promise.resolve({ data: 0, error: null })
      return Promise.resolve({ data: null, error: { message: "unknown rpc" } })
    })
    const result = await withAuthAndQuota(makeReq("Bearer oidc-token"))
    expect("kind" in result && result.kind).toBe("ci")
    // Crucially: did NOT call Better Auth
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it("routes non-OIDC tokens to the user lane (Better Auth)", async () => {
    mockIsOidc.mockReturnValue(false)
    mockGetSession.mockResolvedValueOnce({ user: { id: "u1", email: "x@y.com" } })
    mockRpc.mockImplementation((name) => {
      if (name === "get_user_tokens_today") return Promise.resolve({ data: 0, error: null })
      if (name === "get_global_tokens_today") return Promise.resolve({ data: 0, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    const result = await withAuthAndQuota(makeReq("Bearer better-auth-token"))
    expect("kind" in result && result.kind).toBe("user")
    expect(mockVerifyOidc).not.toHaveBeenCalled()
  })

  it("routes missing bearer to user lane (which 401s)", async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const result = await withAuthAndQuota(makeReq())
    expect("status" in result && result.status).toBe(401)
    expect(mockVerifyOidc).not.toHaveBeenCalled()
  })
})

describe("withCiAuthAndQuota — happy path + quota", () => {
  beforeEach(() => {
    mockIsOidc.mockReturnValue(true)
  })

  it("returns a CI context with repoId from claims", async () => {
    mockVerifyOidc.mockResolvedValueOnce(VALID_CLAIMS)
    mockRpc.mockImplementation((name) => {
      if (name === "get_repo_tokens_today") return Promise.resolve({ data: 1000, error: null })
      if (name === "get_global_tokens_today") return Promise.resolve({ data: 500_000, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    const result = await withAuthAndQuota(makeReq("Bearer oidc"))
    expect("kind" in result && result.kind).toBe("ci")
    if ("kind" in result && result.kind === "ci") {
      expect(result.repoId).toBe(888777)
      expect(result.repoSlug).toBe("acme-corp/docs")
      expect(result.owner).toBe("acme-corp")
      expect(result.eventName).toBe("push")
      expect(result.ref).toBe("refs/heads/main")
      expect(result.usedToday).toBe(1000)
    }
    // Keyed on repo_id (number), not owner/repo — regression guard.
    expect(mockRpc).toHaveBeenCalledWith("get_repo_tokens_today", {
      p_repo_id: 888777,
    })
  })

  it("returns 429 ci_quota_exceeded when repo is over daily cap", async () => {
    mockVerifyOidc.mockResolvedValueOnce(VALID_CLAIMS)
    mockRpc.mockImplementation((name) => {
      if (name === "get_repo_tokens_today") return Promise.resolve({ data: 600_000, error: null })
      return Promise.resolve({ data: 0, error: null })
    })
    const result = await withAuthAndQuota(makeReq("Bearer oidc"))
    expect("status" in result && result.status).toBe(429)
    const body = await (result as Response).json()
    expect(body.error).toBe("ci_quota_exceeded")
    expect(body.dailyLimit).toBe(500_000)
  })

  it("returns 503 global_cap_hit when shared cap is exhausted", async () => {
    mockVerifyOidc.mockResolvedValueOnce(VALID_CLAIMS)
    mockRpc.mockImplementation((name) => {
      if (name === "get_repo_tokens_today") return Promise.resolve({ data: 1000, error: null })
      if (name === "get_global_tokens_today") return Promise.resolve({ data: 10_000_001, error: null })
      return Promise.resolve({ data: 0, error: null })
    })
    const result = await withAuthAndQuota(makeReq("Bearer oidc"))
    expect("status" in result && result.status).toBe(503)
    const body = await (result as Response).json()
    expect(body.error).toBe("global_cap_hit")
  })

  it("returns 503 when the RPC fails (fails-closed on DB errors)", async () => {
    mockVerifyOidc.mockResolvedValueOnce(VALID_CLAIMS)
    mockRpc.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB down" } }),
    )
    const result = await withAuthAndQuota(makeReq("Bearer oidc"))
    expect("status" in result && result.status).toBe(503)
  })
})

describe("withCiAuthAndQuota — OIDC rejection mapping", () => {
  beforeEach(() => {
    mockIsOidc.mockReturnValue(true)
  })

  it("maps wrong_audience → 401 oidc_wrong_audience", async () => {
    mockVerifyOidc.mockRejectedValueOnce(
      new OidcRejected("wrong_audience", "audience mismatch"),
    )
    const result = await withAuthAndQuota(makeReq("Bearer oidc"))
    expect("status" in result && result.status).toBe(401)
    const body = await (result as Response).json()
    expect(body.error).toBe("oidc_wrong_audience")
    // Message points at the fix
    expect(body.message).toContain("helpbase.dev")
  })

  it("maps expired → 401 oidc_invalid with retry hint", async () => {
    mockVerifyOidc.mockRejectedValueOnce(
      new OidcRejected("expired", "expired"),
    )
    const result = await withAuthAndQuota(makeReq("Bearer oidc"))
    expect("status" in result && result.status).toBe(401)
    const body = await (result as Response).json()
    expect(body.error).toBe("oidc_invalid")
    expect(body.message).toContain("expired")
  })

  it("maps fork_pr → 401 oidc_invalid (defensive fork reject)", async () => {
    mockVerifyOidc.mockRejectedValueOnce(
      new OidcRejected("fork_pr", "fork"),
    )
    const result = await withAuthAndQuota(makeReq("Bearer oidc"))
    expect("status" in result && result.status).toBe(401)
    const body = await (result as Response).json()
    expect(body.error).toBe("oidc_invalid")
    expect(body.message).toContain("fork")
  })

  it("maps jwks_unreachable → 503 internal_error", async () => {
    mockVerifyOidc.mockRejectedValueOnce(
      new OidcRejected("jwks_unreachable", "jwks"),
    )
    const result = await withAuthAndQuota(makeReq("Bearer oidc"))
    expect("status" in result && result.status).toBe(503)
    const body = await (result as Response).json()
    expect(body.error).toBe("internal_error")
  })

  it("rejects 400 oidc_invalid when repository_id claim is not a positive integer", async () => {
    mockVerifyOidc.mockResolvedValueOnce({
      ...VALID_CLAIMS,
      repository_id: "not-a-number",
    })
    const result = await withAuthAndQuota(makeReq("Bearer oidc"))
    expect("status" in result && result.status).toBe(400)
    const body = await (result as Response).json()
    expect(body.error).toBe("oidc_invalid")
  })
})

describe("logUsageEvent — dispatch by kind", () => {
  it("writes a CI context to llm_usage_events_ci with repo_id", async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null })
    await logUsageEvent(
      {
        kind: "ci",
        repoId: 42,
        repoSlug: "acme/x",
        owner: "acme",
        eventName: "push",
        ref: "refs/heads/main",
        usedToday: 0,
        resetAtIso: new Date().toISOString(),
        maxOutputTokens: 100_000,
      },
      {
        route: "generate-text",
        model: "openai/gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        costUsd: 0.001,
        status: "ok",
        latencyMs: 200,
      },
    )
    expect(mockFrom).toHaveBeenCalledWith("llm_usage_events_ci")
    expect(mockFrom).not.toHaveBeenCalledWith("llm_usage_events")
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        repo_id: 42,
        repo_slug: "acme/x",
        owner: "acme",
        event_name: "push",
        ref: "refs/heads/main",
        route: "generate-text",
        status: "ok",
      }),
    )
  })

  it("writes a user context to llm_usage_events with user_id", async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null })
    await logUsageEvent(
      {
        kind: "user",
        userId: "u-text-id",
        usedToday: 0,
        resetAtIso: new Date().toISOString(),
        maxOutputTokens: 100_000,
      },
      {
        route: "generate-object",
        model: "openai/gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        costUsd: 0.001,
        status: "ok",
        latencyMs: 200,
      },
    )
    expect(mockFrom).toHaveBeenCalledWith("llm_usage_events")
    expect(mockFrom).not.toHaveBeenCalledWith("llm_usage_events_ci")
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u-text-id",
        route: "generate-object",
      }),
    )
  })

  it("bumps the shared global_daily_tokens counter from both lanes", async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null })
    // CI write
    await logUsageEvent(
      {
        kind: "ci",
        repoId: 42,
        repoSlug: "acme/x",
        owner: "acme",
        eventName: "push",
        ref: null,
        usedToday: 0,
        resetAtIso: new Date().toISOString(),
        maxOutputTokens: 100_000,
      },
      {
        route: "generate-text",
        model: "m",
        promptTokens: 10,
        completionTokens: 20,
        costUsd: 0,
        status: "ok",
        latencyMs: 10,
      },
    )
    // User write
    await logUsageEvent(
      {
        kind: "user",
        userId: "u1",
        usedToday: 0,
        resetAtIso: new Date().toISOString(),
        maxOutputTokens: 100_000,
      },
      {
        route: "generate-text",
        model: "m",
        promptTokens: 5,
        completionTokens: 5,
        costUsd: 0,
        status: "ok",
        latencyMs: 10,
      },
    )
    // Both should have called increment_global_tokens.
    const incrCalls = mockRpc.mock.calls.filter(
      ([name]) => name === "increment_global_tokens",
    )
    expect(incrCalls.length).toBe(2)
    // Deltas correspond to the totals we logged (30, then 10).
    expect(incrCalls[0]?.[1]).toMatchObject({ p_delta: 30 })
    expect(incrCalls[1]?.[1]).toMatchObject({ p_delta: 10 })
  })

  it("skips the global increment on gateway_error (don't charge for failed calls)", async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null })
    await logUsageEvent(
      {
        kind: "ci",
        repoId: 42,
        repoSlug: "acme/x",
        owner: "acme",
        eventName: "push",
        ref: null,
        usedToday: 0,
        resetAtIso: new Date().toISOString(),
        maxOutputTokens: 100_000,
      },
      {
        route: "generate-text",
        model: "m",
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
        status: "gateway_error",
        latencyMs: 10,
      },
    )
    const incrCalls = mockRpc.mock.calls.filter(
      ([name]) => name === "increment_global_tokens",
    )
    expect(incrCalls.length).toBe(0)
  })
})
