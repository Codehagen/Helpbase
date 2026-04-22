import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Unit tests for resolveAuthOrPromptLogin priority order.
 *
 * Focus: the HELPBASE_CI_TOKEN branch added for Lane B of the OIDC
 * zero-config CI auth work (helpbase@0.8.0). Asserts CI_TOKEN:
 *   - Wins over no-session + no-TTY (CI shape)
 *   - Loses to BYOK (user's own key beats proxy)
 *   - Does NOT roundtrip through Better Auth (we pass the raw JWT)
 */

const mockGetCurrentSession = vi.fn<() => Promise<null | { accessToken: string; email: string }>>()
const mockIsByokMode = vi.fn<() => boolean>()
const mockIsNonInteractive = vi.fn<() => boolean>()

vi.mock("../src/lib/auth.js", () => ({
  getCurrentSession: () => mockGetCurrentSession(),
  isNonInteractive: () => mockIsNonInteractive(),
  deviceLogin: vi.fn(),
}))

vi.mock("@workspace/shared/llm", () => ({
  isByokMode: () => mockIsByokMode(),
}))

const { resolveAuthOrPromptLogin } = await import(
  "../src/lib/inline-auth.ts"
)

beforeEach(() => {
  mockGetCurrentSession.mockReset()
  mockIsByokMode.mockReset().mockReturnValue(false)
  mockIsNonInteractive.mockReset().mockReturnValue(true)
  // Clean env between tests
  delete process.env.HELPBASE_CI_TOKEN
  delete process.env.HELPBASE_TOKEN
})

afterEach(() => {
  delete process.env.HELPBASE_CI_TOKEN
  delete process.env.HELPBASE_TOKEN
})

describe("resolveAuthOrPromptLogin — priority order", () => {
  it("returns BYOK mode when isByokMode() is true (even with CI token set)", async () => {
    mockIsByokMode.mockReturnValue(true)
    process.env.HELPBASE_CI_TOKEN = "ghs.fake.jwt"
    const result = await resolveAuthOrPromptLogin({ verb: "sync" })
    expect(result).toEqual({ byok: true })
    // Session lookup should NOT have been attempted — BYOK short-circuits.
    expect(mockGetCurrentSession).not.toHaveBeenCalled()
  })

  it("returns CI token as authToken when HELPBASE_CI_TOKEN is set", async () => {
    process.env.HELPBASE_CI_TOKEN = "ghs.fake.jwt.value"
    const result = await resolveAuthOrPromptLogin({ verb: "sync" })
    expect(result).toEqual({
      byok: false,
      authToken: "ghs.fake.jwt.value",
    })
    // Crucially: no Better Auth session lookup — we pass the JWT raw.
    expect(mockGetCurrentSession).not.toHaveBeenCalled()
  })

  it("ignores empty HELPBASE_CI_TOKEN and falls through to session lookup", async () => {
    process.env.HELPBASE_CI_TOKEN = ""
    mockGetCurrentSession.mockResolvedValueOnce({
      accessToken: "session-token",
      email: "x@y.com",
    })
    const result = await resolveAuthOrPromptLogin({ verb: "sync" })
    expect(result.authToken).toBe("session-token")
  })

  it("returns the session when it exists (no CI_TOKEN set)", async () => {
    mockGetCurrentSession.mockResolvedValueOnce({
      accessToken: "session-token",
      email: "x@y.com",
    })
    const result = await resolveAuthOrPromptLogin({ verb: "sync" })
    expect(result.byok).toBe(false)
    expect(result.authToken).toBe("session-token")
  })

  it("throws E_AUTH_REQUIRED when non-TTY AND no session AND no CI_TOKEN", async () => {
    mockGetCurrentSession.mockResolvedValueOnce(null)
    mockIsNonInteractive.mockReturnValue(true)
    await expect(
      resolveAuthOrPromptLogin({ verb: "sync", retryCommand: "helpbase sync" }),
    ).rejects.toMatchObject({ code: "E_AUTH_REQUIRED" })
  })
})
