import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Isolate AUTH_FILE writes per test run by pointing HOME at a tmp dir
// BEFORE importing the module that captures AUTH_DIR at load time.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-auth-unit-"))
process.env.HOME = TMP_HOME
const AUTH_FILE = path.join(TMP_HOME, ".helpbase", "auth.json")

const realFetch = globalThis.fetch
function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    return handler(url)
  }) as typeof fetch
}

const { getCurrentSession, toAuthSession, verifyLoginFromMagicLink } = await import(
  "../src/lib/auth.js"
)

beforeEach(() => {
  delete process.env.HELPBASE_TOKEN
  if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE)
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("toAuthSession", () => {
  it("maps SessionResponse fields to on-disk shape with epoch-seconds expiry", () => {
    const session = toAuthSession(
      {
        user: {
          id: "u1",
          email: "x@y.com",
          name: "X",
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
      },
      "bearer-123",
    )
    expect(session.userId).toBe("u1")
    expect(session.email).toBe("x@y.com")
    expect(session.accessToken).toBe("bearer-123")
    expect(session.refreshToken).toBe("")
    // 2026-04-24T00:00:00Z = 1777334400 in Unix seconds
    expect(session.expiresAt).toBe(Math.floor(new Date("2026-04-24T00:00:00Z").getTime() / 1000))
  })
})

describe("getCurrentSession", () => {
  it("returns null when no stored session and no HELPBASE_TOKEN env", async () => {
    expect(await getCurrentSession()).toBeNull()
  })

  it("clears the stored session when server returns null", async () => {
    // Seed auth.json
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
    fs.writeFileSync(
      AUTH_FILE,
      JSON.stringify({
        user_id: "u1",
        email: "x@y.com",
        access_token: "stale",
        refresh_token: "",
        expires_at: 0,
      }),
    )
    stubFetch(() => new Response("nope", { status: 401 }))
    expect(await getCurrentSession()).toBeNull()
    expect(fs.existsSync(AUTH_FILE)).toBe(false)
  })

  it("round-trips a valid stored session via server confirmation", async () => {
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
    fs.writeFileSync(
      AUTH_FILE,
      JSON.stringify({
        user_id: "u1",
        email: "x@y.com",
        access_token: "valid",
        refresh_token: "",
        expires_at: 0,
      }),
    )
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            user: {
              id: "u1",
              email: "x@y.com",
              name: "X",
              emailVerified: true,
              image: null,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            },
            session: {
              id: "s1",
              token: "valid",
              userId: "u1",
              expiresAt: "2026-04-24T00:00:00Z",
            },
          }),
          { status: 200 },
        ),
    )
    const s = await getCurrentSession()
    expect(s?.userId).toBe("u1")
    expect(s?.email).toBe("x@y.com")
  })

  it("tolerates missing refresh_token field (pre-migration disk format)", async () => {
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
    fs.writeFileSync(
      AUTH_FILE,
      JSON.stringify({
        user_id: "u1",
        email: "x@y.com",
        access_token: "valid",
        // no refresh_token key — pre-migration Supabase JSON layout
        expires_at: 0,
      }),
    )
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            user: {
              id: "u1",
              email: "x@y.com",
              name: "X",
              emailVerified: true,
              image: null,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            },
            session: {
              id: "s1",
              token: "valid",
              userId: "u1",
              expiresAt: "2026-04-24T00:00:00Z",
            },
          }),
          { status: 200 },
        ),
    )
    const s = await getCurrentSession()
    expect(s?.userId).toBe("u1")
  })
})

describe("verifyLoginFromMagicLink", () => {
  it("writes auth.json and returns an AuthSession on success", async () => {
    stubFetch((url) => {
      if (url.includes("/magic-link/verify")) {
        return new Response(null, {
          status: 302,
          headers: { "set-auth-token": "fresh-bearer" },
        })
      }
      if (url.includes("/get-session")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u2",
              email: "new@y.com",
              name: "N",
              emailVerified: true,
              image: null,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            },
            session: {
              id: "s2",
              token: "fresh-bearer",
              userId: "u2",
              expiresAt: "2026-04-24T00:00:00Z",
            },
          }),
          { status: 200 },
        )
      }
      return new Response("nope", { status: 500 })
    })
    const s = await verifyLoginFromMagicLink(
      "http://helpbase.dev/api/auth/magic-link/verify?token=abcdef123456",
    )
    expect(s.userId).toBe("u2")
    expect(s.email).toBe("new@y.com")
    expect(fs.existsSync(AUTH_FILE)).toBe(true)
    const onDisk = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"))
    expect(onDisk.access_token).toBe("fresh-bearer")
  })

  it("throws E_AUTH_VERIFY_OTP on malformed magic link", async () => {
    await expect(verifyLoginFromMagicLink("http://helpbase.dev/nope")).rejects.toMatchObject({
      code: "E_AUTH_VERIFY_OTP",
    })
  })

  it("throws E_AUTH_VERIFY_OTP when the server mints a bearer but getSession returns null", async () => {
    stubFetch((url) => {
      if (url.includes("/magic-link/verify")) {
        return new Response(null, {
          status: 302,
          headers: { "set-auth-token": "fresh-bearer" },
        })
      }
      if (url.includes("/get-session")) {
        return new Response("null", { status: 200 })
      }
      return new Response("nope", { status: 500 })
    })
    await expect(
      verifyLoginFromMagicLink(
        "http://helpbase.dev/api/auth/magic-link/verify?token=abcdef123456",
      ),
    ).rejects.toMatchObject({ code: "E_AUTH_VERIFY_OTP" })
  })
})
