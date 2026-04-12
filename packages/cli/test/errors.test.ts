import { describe, it, expect } from "vitest"
import {
  ERROR_DOC_BASE,
  HelpbaseError,
  formatError,
} from "../src/lib/errors.js"

describe("HelpbaseError", () => {
  it("carries code, problem, cause, and fix", () => {
    const err = new HelpbaseError({
      code: "E_SLUG_TAKEN",
      problem: "Slug already in use",
      cause: "Another tenant registered 'foo'",
      fix: "Try a different --slug",
    })
    expect(err.code).toBe("E_SLUG_TAKEN")
    expect(err.problem).toBe("Slug already in use")
    expect(err.cause).toBe("Another tenant registered 'foo'")
    expect(err.fix).toEqual(["Try a different --slug"])
    expect(err.message).toBe("Slug already in use")
  })

  it("normalizes a single fix into an array", () => {
    const err = new HelpbaseError({
      code: "E_NO_CONTENT_DIR",
      problem: "p",
      fix: "one fix",
    })
    expect(err.fix).toEqual(["one fix"])
  })

  it("keeps a list of fixes as-is", () => {
    const err = new HelpbaseError({
      code: "E_NO_CONTENT_DIR",
      problem: "p",
      fix: ["first", "second"],
    })
    expect(err.fix).toEqual(["first", "second"])
  })

  it("builds a doc URL from the code", () => {
    const err = new HelpbaseError({
      code: "E_AUTH_SEND_OTP",
      problem: "p",
      fix: "f",
    })
    expect(err.docUrl()).toBe(`${ERROR_DOC_BASE}/e-auth-send-otp`)
  })
})

describe("formatError", () => {
  it("includes problem, code tag, fix, and doc URL", () => {
    const err = new HelpbaseError({
      code: "E_SLUG_TAKEN",
      problem: "Subdomain is taken",
      fix: "Pick another",
    })
    const out = formatError(err)
    expect(out).toContain("Subdomain is taken")
    expect(out).toContain("[E_SLUG_TAKEN]")
    expect(out).toContain("Pick another")
    expect(out).toContain("helpbase.dev/errors/e-slug-taken")
  })

  it("includes the cause line when provided", () => {
    const err = new HelpbaseError({
      code: "E_AUTH_VERIFY_OTP",
      problem: "Code didn't verify",
      cause: "expired",
      fix: "Retry",
    })
    const out = formatError(err)
    expect(out).toContain("cause:")
    expect(out).toContain("expired")
  })

  it("renders multiple fixes as a bulleted list", () => {
    const err = new HelpbaseError({
      code: "E_AUTH_SEND_OTP",
      problem: "p",
      fix: ["A", "B", "C"],
    })
    const out = formatError(err)
    expect(out).toContain("• A")
    expect(out).toContain("• B")
    expect(out).toContain("• C")
  })
})
