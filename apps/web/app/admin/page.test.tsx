/* @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

import AdminIndexPage from "./page"

describe("AdminIndexPage", () => {
  it("redirects to /admin/usage", () => {
    expect(() => AdminIndexPage()).toThrow(/REDIRECT:\/admin\/usage/)
  })
})
