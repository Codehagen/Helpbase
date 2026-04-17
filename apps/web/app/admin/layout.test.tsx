/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}))

import { auth } from "@/lib/auth"
import AdminLayout from "./layout"

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("redirects to /device when no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)
    await expect(AdminLayout({ children: null })).rejects.toThrow(/REDIRECT:\/device/)
  })

  it("redirects to /device when session has no user.id", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({ user: {} } as never)
    await expect(AdminLayout({ children: null })).rejects.toThrow(/REDIRECT:\/device/)
  })

  it("does not redirect when a valid session exists", async () => {
    // Behavioral assertion: with a session, AdminLayout resolves instead
    // of throwing the redirect sentinel. Asserting on the root element's
    // component identity (function name, type === "div") was brittle —
    // wrapping the shell in QueryProvider shouldn't break this test.
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1", email: "me@example.com" },
    } as never)
    const { redirect } = await import("next/navigation")
    const out = await AdminLayout({ children: null })
    expect(out).toBeDefined()
    expect(redirect).not.toHaveBeenCalled()
  })
})
