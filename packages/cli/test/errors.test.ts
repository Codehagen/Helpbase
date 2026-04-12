import { describe, it, expect } from "vitest"
import {
  ERROR_DOC_BASE,
  HelpbaseError,
  formatError,
  isNetworkError,
  toNetworkError,
  type ErrorCode,
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

describe("new Phase 1 error codes", () => {
  const codes: ErrorCode[] = [
    "E_AUTH_EXPIRED",
    "E_NETWORK",
    "E_MISSING_FLAG",
    "E_FILE_EXISTS",
  ]

  for (const code of codes) {
    it(`${code} formats with code tag, fix, and doc URL`, () => {
      const err = new HelpbaseError({
        code,
        problem: `${code} occurred`,
        fix: "do something",
      })
      const out = formatError(err)
      expect(out).toContain(`[${code}]`)
      expect(out).toContain("do something")
      expect(err.docUrl()).toBe(`${ERROR_DOC_BASE}/${code.toLowerCase().replace(/_/g, "-")}`)
    })
  }

  // Representative snapshot — catches unintentional copy regressions without
  // forcing one-per-code churn.
  it("E_FILE_EXISTS has a stable representative shape", () => {
    const err = new HelpbaseError({
      code: "E_FILE_EXISTS",
      problem: "File exists: content/foo.png",
      cause: "--no-overwrite is set, and this image already lives at the destination.",
      fix: [
        "Remove `--no-overwrite` to allow overwriting.",
        "Or delete the existing file and re-run `helpbase generate`.",
      ],
    })
    const out = formatError(err).replace(/\x1b\[[0-9;]*m/g, "") // strip ANSI
    expect(out).toMatchInlineSnapshot(`
      "✖ File exists: content/foo.png [E_FILE_EXISTS]
        cause: --no-overwrite is set, and this image already lives at the destination.
        fix:
          • Remove \`--no-overwrite\` to allow overwriting.
          • Or delete the existing file and re-run \`helpbase generate\`.
        docs:  https://helpbase.dev/errors/e-file-exists
      "
    `)
  })
})

describe("isNetworkError", () => {
  it("matches ECONNREFUSED", () => {
    expect(isNetworkError(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe(true)
  })

  it("matches ENOTFOUND", () => {
    expect(isNetworkError(Object.assign(new Error("x"), { code: "ENOTFOUND" }))).toBe(true)
  })

  it("matches undici UND_ERR_* codes", () => {
    expect(
      isNetworkError(Object.assign(new Error("x"), { code: "UND_ERR_SOCKET" })),
    ).toBe(true)
  })

  it("matches 'fetch failed' TypeError", () => {
    expect(isNetworkError(new TypeError("fetch failed"))).toBe(true)
  })

  it("matches a network error through .cause", () => {
    const inner = Object.assign(new Error("inner"), { code: "ETIMEDOUT" })
    const outer = Object.assign(new Error("wrapper"), { cause: inner })
    expect(isNetworkError(outer)).toBe(true)
  })

  it("does not match unrelated errors", () => {
    expect(isNetworkError(new Error("nope"))).toBe(false)
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError("string")).toBe(false)
  })
})

describe("toNetworkError", () => {
  it("wraps a network error into a HelpbaseError with E_NETWORK", () => {
    const raw = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })
    const wrapped = toNetworkError(raw, "deploy")
    expect(wrapped).toBeInstanceOf(HelpbaseError)
    const he = wrapped as HelpbaseError
    expect(he.code).toBe("E_NETWORK")
    expect(he.problem).toContain("deploy")
    expect(he.fix.join(" ")).toMatch(/retry/i)
  })

  it("passes through an existing HelpbaseError unchanged", () => {
    const he = new HelpbaseError({ code: "E_AUTH_EXPIRED", problem: "p", fix: "f" })
    expect(toNetworkError(he, "op")).toBe(he)
  })

  it("passes through non-network errors unchanged", () => {
    const err = new Error("regular boom")
    expect(toNetworkError(err, "op")).toBe(err)
  })
})
