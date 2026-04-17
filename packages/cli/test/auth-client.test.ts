import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  consumeMagicLink,
  getSessionWithBearer,
  pollDeviceAuth,
  sendMagicLink,
  startDeviceAuth,
} from "../src/lib/auth-client.js"

// Covers: extractVerificationToken (implicitly via consumeMagicLink),
// sendMagicLink, startDeviceAuth, pollDeviceAuth, consumeMagicLink,
// getSessionWithBearer. All network calls mocked via global.fetch stub.

const realFetch = globalThis.fetch

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    return handler(url, init)
  }) as typeof fetch
}

beforeEach(() => {
  // baseURL: default production host unless overridden
  delete process.env.HELPBASE_BASE_URL
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("sendMagicLink", () => {
  it("POSTs to /api/auth/sign-in/magic-link with the email + callback", async () => {
    const calls: { url: string; body: unknown }[] = []
    stubFetch((url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      return new Response("{}", { status: 200 })
    })
    await sendMagicLink("user@example.com")
    expect(calls[0]!.url).toContain("/api/auth/sign-in/magic-link")
    expect(calls[0]!.body).toMatchObject({ email: "user@example.com" })
  })

  it("throws with the status + (redacted) body on non-2xx", async () => {
    stubFetch(() => new Response("some-token-like-XhR9dK2pLmNqZvA4tBcDwEfG", { status: 429 }))
    await expect(sendMagicLink("x@y.com")).rejects.toThrow(/429/)
    // Token-like string must be redacted out of the thrown message.
    await expect(sendMagicLink("x@y.com")).rejects.toThrow(/\[redacted\]/)
  })
})

describe("consumeMagicLink", () => {
  it("rejects input with no token param", async () => {
    await expect(consumeMagicLink("http://helpbase.dev/nope?foo=bar")).rejects.toThrow(
      /verification token/,
    )
  })

  it("extracts token from query string and returns bearer from set-auth-token header", async () => {
    stubFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: {
            "set-auth-token": "bearer-42-sig",
            location: "/",
          },
        }),
    )
    const bearer = await consumeMagicLink(
      "http://helpbase.dev/api/auth/magic-link/verify?token=abcdef123456",
    )
    expect(bearer).toBe("bearer-42-sig")
  })

  it("extracts token from hash fragment when query absent", async () => {
    stubFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { "set-auth-token": "bearer-from-hash" },
        }),
    )
    const bearer = await consumeMagicLink("http://helpbase.dev/#token=hashtokenXYZ789")
    expect(bearer).toBe("bearer-from-hash")
  })

  it("accepts a bare token string (no URL)", async () => {
    stubFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { "set-auth-token": "bearer-bare" },
        }),
    )
    const bearer = await consumeMagicLink("plaintokenvaluewithmorethansixteenchars")
    expect(bearer).toBe("bearer-bare")
  })

  it("rejects a 15-char bare string (below the min-length guard)", async () => {
    await expect(consumeMagicLink("short_token_123")).rejects.toThrow(/verification token/)
  })

  it("throws on non-302 error status", async () => {
    stubFetch(() => new Response("bad request", { status: 400 }))
    await expect(consumeMagicLink("http://x/y?token=abcdefghijklmnop")).rejects.toThrow(/400/)
  })

  it("throws when 302 comes back but set-auth-token header is missing (replay)", async () => {
    stubFetch(() => new Response(null, { status: 302 }))
    await expect(consumeMagicLink("http://x/y?token=abcdefghijklmnop")).rejects.toThrow(
      /already used or expired/,
    )
  })
})

describe("startDeviceAuth", () => {
  it("POSTs to /device/code with scope + client_id", async () => {
    const calls: { url: string; body: unknown }[] = []
    stubFetch((url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      return new Response(
        JSON.stringify({
          device_code: "dc",
          user_code: "ABCD-1234",
          verification_uri: "https://helpbase.dev/device",
          verification_uri_complete: "https://helpbase.dev/device?user_code=ABCD-1234",
          expires_in: 600,
          interval: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    })
    const result = await startDeviceAuth("helpbase-cli")
    expect(calls[0]!.url).toContain("/api/auth/device/code")
    expect(calls[0]!.body).toMatchObject({
      client_id: "helpbase-cli",
      scope: "openid profile email",
    })
    expect(result.device_code).toBe("dc")
    expect(result.user_code).toBe("ABCD-1234")
    expect(result.expires_in).toBe(600)
  })

  it("throws with the status on failure", async () => {
    stubFetch(() => new Response("bang", { status: 500 }))
    await expect(startDeviceAuth()).rejects.toThrow(/device\/code failed \(500\)/)
  })
})

describe("pollDeviceAuth", () => {
  it("returns {accessToken} on 2xx with access_token", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ access_token: "bearer-poll" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    const out = await pollDeviceAuth("dc")
    expect(out).toEqual({ accessToken: "bearer-poll" })
  })

  it("returns {error: authorization_pending} on 400 RFC response", async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            error: "authorization_pending",
            error_description: "Authorization pending",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    )
    const out = await pollDeviceAuth("dc")
    expect(out).toEqual({
      error: "authorization_pending",
      description: "Authorization pending",
    })
  })

  it("returns {error: slow_down} when server asks for backoff", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: "slow_down" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    )
    const out = await pollDeviceAuth("dc")
    expect("error" in out && out.error).toBe("slow_down")
  })

  it("returns {error: access_denied} when user cancels", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: "access_denied" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    )
    const out = await pollDeviceAuth("dc")
    expect("error" in out && out.error).toBe("access_denied")
  })

  it("returns {error: expired_token} when TTL hit", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: "expired_token" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    )
    const out = await pollDeviceAuth("dc")
    expect("error" in out && out.error).toBe("expired_token")
  })

  it("throws on 2xx without access_token (protocol violation)", async () => {
    stubFetch(() => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }))
    await expect(pollDeviceAuth("dc")).rejects.toThrow(/2xx without access_token/)
  })

  it("throws on non-JSON body", async () => {
    stubFetch(() => new Response("<html>500</html>", { status: 500 }))
    await expect(pollDeviceAuth("dc")).rejects.toThrow(/bad JSON/)
  })

  it("throws on non-2xx without RFC error body", async () => {
    stubFetch(() => new Response(JSON.stringify({ unexpected: "shape" }), { status: 400 }))
    await expect(pollDeviceAuth("dc")).rejects.toThrow(/device\/token: 400/)
  })
})

describe("getSessionWithBearer", () => {
  it("returns session + user on 200", async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            user: {
              id: "u1",
              email: "x@y.com",
              name: "X Y",
              emailVerified: true,
              image: null,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            },
            session: {
              id: "s1",
              token: "tok",
              userId: "u1",
              expiresAt: "2026-04-24T00:00:00Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const s = await getSessionWithBearer("tok")
    expect(s?.user.id).toBe("u1")
  })

  it("returns null on non-2xx", async () => {
    stubFetch(() => new Response("nope", { status: 401 }))
    const s = await getSessionWithBearer("bad")
    expect(s).toBeNull()
  })

  it("returns null when the body is literal 'null'", async () => {
    stubFetch(() => new Response("null", { status: 200, headers: { "content-type": "application/json" } }))
    const s = await getSessionWithBearer("tok")
    expect(s).toBeNull()
  })

  it("returns null on malformed JSON", async () => {
    stubFetch(() => new Response("not-json", { status: 200 }))
    const s = await getSessionWithBearer("tok")
    expect(s).toBeNull()
  })
})
