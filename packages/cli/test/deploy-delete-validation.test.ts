import { describe, it, expect } from "vitest"

/**
 * The `--delete <slug>` branch in deploy.ts exits on the first validation
 * failure before hitting Supabase. These tests cover the regex the branch
 * uses; the full delete flow is exercised by scripts/smoke-deploy.sh.
 */

// Keep in sync with SLUG_REGEX in deploy.ts.
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

describe("SLUG_REGEX (matches deploy.ts)", () => {
  it("accepts valid slugs", () => {
    expect(SLUG_REGEX.test("vegard")).toBe(true)
    expect(SLUG_REGEX.test("acme-docs")).toBe(true)
    expect(SLUG_REGEX.test("a1b2c3")).toBe(true)
    expect(SLUG_REGEX.test("my-product-v2")).toBe(true)
  })

  it("rejects uppercase", () => {
    expect(SLUG_REGEX.test("Vegard")).toBe(false)
    expect(SLUG_REGEX.test("ACME")).toBe(false)
  })

  it("rejects leading/trailing hyphen", () => {
    expect(SLUG_REGEX.test("-vegard")).toBe(false)
    expect(SLUG_REGEX.test("vegard-")).toBe(false)
    expect(SLUG_REGEX.test("-acme-")).toBe(false)
  })

  it("rejects non-alphanumerics", () => {
    expect(SLUG_REGEX.test("v e g a r d")).toBe(false)
    expect(SLUG_REGEX.test("vegard.acme")).toBe(false)
    expect(SLUG_REGEX.test("vegard/acme")).toBe(false)
    expect(SLUG_REGEX.test("vegard@acme")).toBe(false)
    expect(SLUG_REGEX.test("vegard_acme")).toBe(false)
  })

  it("rejects single-char and empty strings", () => {
    expect(SLUG_REGEX.test("")).toBe(false)
    expect(SLUG_REGEX.test("a")).toBe(false)
  })

  it("accepts minimum 2-char slugs (first+last char)", () => {
    // The regex requires [a-z0-9] + ([a-z0-9-]*[a-z0-9])? — 2 chars minimum.
    expect(SLUG_REGEX.test("ab")).toBe(true)
    expect(SLUG_REGEX.test("a1")).toBe(true)
  })
})
