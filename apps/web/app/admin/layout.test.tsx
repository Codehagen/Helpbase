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

  it("renders layout with children when session exists", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1", email: "me@example.com" },
    } as never)
    const out = await AdminLayout({ children: null })
    expect(out).toBeDefined()
    // The returned element is a plain React element — inspect the tree
    // instead of rendering to DOM (requires Link/Suspense shims otherwise).
    // Root is <QueryProvider>, a function component.
    expect(typeof out.type).toBe("function")
    expect(out.type).toHaveProperty("name", "QueryProvider")
  })
})
