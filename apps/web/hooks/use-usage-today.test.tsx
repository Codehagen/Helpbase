/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { useUsageToday } from "./use-usage-today"

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe("useUsageToday", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns the usage payload on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        email: "user@example.com",
        quota: { usedToday: 12345, dailyLimit: 500000, resetAt: "2026-04-18T00:00:00Z" },
      }),
    } as Response)

    const { result } = renderHook(() => useUsageToday(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.email).toBe("user@example.com")
    expect(result.current.data?.quota.usedToday).toBe(12345)
  })

  it("surfaces 401 as an error with auth_required code", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: "auth_required", message: "Sign in." }),
    } as Response)

    const { result } = renderHook(() => useUsageToday(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
    // ApiError shape (from lib/fetchers.ts)
    expect((result.current.error as Error & { code?: string }).code).toBe("auth_required")
  })
})
