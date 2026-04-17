import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"

// Stub the child_process spawn so deviceLogin's openBrowser call
// doesn't actually launch a browser during tests.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({ unref: () => {} })),
}))

// Isolate AUTH_FILE writes per test run by pointing HOME at a tmp dir
// BEFORE importing the modules that capture AUTH_DIR at load time.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-auth-test-"))
process.env.HOME = TMP_HOME

const realFetch = globalThis.fetch
function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    return handler(url, init)
  }) as typeof fetch
}

// Import AFTER HOME is overridden so storeSession writes land in the tmp dir.
const { deviceLogin } = await import("../src/lib/auth-device.js")

beforeEach(() => {
  delete process.env.HELPBASE_LOGIN_NO_BROWSER
  delete process.env.CODESPACES
  delete process.env.SSH_TTY
  delete process.env.SSH_CONNECTION
})

afterEach(() => {
  globalThis.fetch = realFetch
  // clean any auth.json written by the test
  const f = path.join(TMP_HOME, ".helpbase", "auth.json")
  if (fs.existsSync(f)) fs.unlinkSync(f)
})

// Helper: canned /device/code response + scripted /device/token sequence.
function scriptedFlow(pollResponses: Array<{ status: number; body: unknown }>) {
  let pollIndex = 0
  stubFetch((url) => {
    if (url.includes("/device/code")) {
      return new Response(
        JSON.stringify({
          device_code: "dc",
          user_code: "ABCD-1234",
          verification_uri: "https://helpbase.dev/device",
          verification_uri_complete: "https://helpbase.dev/device?user_code=ABCD-1234",
          expires_in: 600,
          interval: 0.01, // tiny for test speed
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    if (url.includes("/device/token")) {
      const r = pollResponses[Math.min(pollIndex, pollResponses.length - 1)]!
      pollIndex += 1
      return new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.includes("/get-session")) {
      return new Response(
        JSON.stringify({
          user: {
            id: "u1",
            email: "u@example.com",
            name: "U",
            emailVerified: true,
            image: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
          session: {
            id: "s1",
            token: "bearer-after-approve",
            userId: "u1",
            expiresAt: "2026-04-24T00:00:00Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    return new Response("unexpected", { status: 500 })
  })
}

describe("deviceLogin", () => {
  it("returns an AuthSession on successful approval after a pending tick", async () => {
    scriptedFlow([
      { status: 400, body: { error: "authorization_pending" } },
      { status: 200, body: { access_token: "bearer-after-approve" } },
    ])
    const session = await deviceLogin({ shouldOpenBrowser: false })
    expect(session.userId).toBe("u1")
    expect(session.email).toBe("u@example.com")
    expect(session.accessToken).toBe("bearer-after-approve")
  })

  it("throws E_DEVICE_DENIED when user clicks Cancel", async () => {
    scriptedFlow([{ status: 400, body: { error: "access_denied", error_description: "User cancelled" } }])
    await expect(deviceLogin({ shouldOpenBrowser: false })).rejects.toMatchObject({
      code: "E_DEVICE_DENIED",
    })
  })

  it("throws E_DEVICE_EXPIRED on expired_token", async () => {
    scriptedFlow([{ status: 400, body: { error: "expired_token" } }])
    await expect(deviceLogin({ shouldOpenBrowser: false })).rejects.toMatchObject({
      code: "E_DEVICE_EXPIRED",
    })
  })

  it("throws E_AUTH_CANCELLED when abort signal fires", async () => {
    scriptedFlow([{ status: 400, body: { error: "authorization_pending" } }])
    const controller = new AbortController()
    // Fire abort after the first poll tick starts sleeping.
    setTimeout(() => controller.abort(), 5)
    await expect(
      deviceLogin({ shouldOpenBrowser: false, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "E_AUTH_CANCELLED" })
  })

  it("calls onStart with the device-code info", async () => {
    scriptedFlow([{ status: 200, body: { access_token: "bearer-after-approve" } }])
    const starts: unknown[] = []
    await deviceLogin({
      shouldOpenBrowser: false,
      onStart: (info) => starts.push(info),
    })
    expect(starts).toHaveLength(1)
    expect((starts[0] as { user_code: string }).user_code).toBe("ABCD-1234")
  })
})
