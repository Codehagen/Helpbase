/* @vitest-environment jsdom */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest"

// The analytics helper reads NEXT_PUBLIC_SUPABASE_URL / ANON_KEY at import
// time via process.env substitution. We set the env before each import so
// the module-scoped constants resolve correctly, then re-import per test
// via vi.resetModules so each test gets a fresh module with fresh env.

describe("track()", () => {
  const URL = "https://project.supabase.co"
  const KEY = "test-anon-key"
  const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let fetchMock: MockInstance

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY
    vi.resetModules()
    fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }))
    Object.defineProperty(window, "location", {
      value: { pathname: "/", search: "" },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY
  })

  it("POSTs to the track edge function with the correct shape", async () => {
    const { track } = await import("@/lib/analytics")

    track("hero_install_copied", { command: "pnpm dlx create-helpbase" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe(`${URL}/functions/v1/track`)
    expect(init.method).toBe("POST")
    expect(init.keepalive).toBe(true)
    const headers = init.headers as Record<string, string>
    expect(headers["content-type"]).toBe("application/json")
    expect(headers.apikey).toBe(KEY)
    expect(headers.authorization).toBe(`Bearer ${KEY}`)
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      event: "hero_install_copied",
      path: "/",
      metadata: { command: "pnpm dlx create-helpbase" },
    })
  })

  it("includes window.location.pathname + search in path", async () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/docs/intro", search: "?ref=twitter" },
      writable: true,
    })
    const { track } = await import("@/lib/analytics")

    track("page_view")

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.path).toBe("/docs/intro?ref=twitter")
  })

  it("swallows synchronous fetch throws without re-throwing", async () => {
    fetchMock.mockImplementation(() => {
      throw new Error("network down synchronously")
    })
    const { track } = await import("@/lib/analytics")

    expect(() => track("page_view")).not.toThrow()
  })

  it("swallows fetch promise rejections without re-throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down async"))
    const { track } = await import("@/lib/analytics")

    // Returns void (no await), must never throw.
    expect(() => track("page_view")).not.toThrow()
    // Drain microtasks so the .catch on the rejected promise runs.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it("no-ops when NEXT_PUBLIC_SUPABASE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    vi.resetModules()
    const { track } = await import("@/lib/analytics")

    track("page_view")

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("no-ops when NEXT_PUBLIC_SUPABASE_ANON_KEY is unset", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    vi.resetModules()
    const { track } = await import("@/lib/analytics")

    track("page_view")

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
