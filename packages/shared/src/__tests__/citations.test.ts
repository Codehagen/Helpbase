import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  createFileCache,
  readFileForCitation,
  readSnippet,
  validateCitation,
  validateArticleCitations,
  normalizeWhitespace,
} from "../citations.js"
import type { ContextCitation } from "../schemas.js"

// ── Fixture on disk ───────────────────────────────────────────────────
// Writes a tiny fake repo to a temp dir we can run citation lookups against.
let REPO_ROOT: string
let OUTSIDE_ROOT: string

beforeAll(() => {
  REPO_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-citations-"))
  OUTSIDE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-outside-"))

  fs.mkdirSync(path.join(REPO_ROOT, "src", "routes"), { recursive: true })
  fs.writeFileSync(
    path.join(REPO_ROOT, "src", "routes", "auth.ts"),
    [
      "export function login(email: string, password: string) {",
      "  // Validates credentials and returns a session token.",
      "  if (!email || !password) throw new Error('missing credentials')",
      "  return { token: 'abc', user: { email } }",
      "}",
    ].join("\n") + "\n",
  )
  // CRLF fixture — identical content written with Windows line endings.
  fs.writeFileSync(
    path.join(REPO_ROOT, "src", "routes", "crlf.ts"),
    ["line one", "line two", "line three"].join("\r\n"),
  )
  // Multi-space content for whitespace-normalized match test
  fs.writeFileSync(
    path.join(REPO_ROOT, "README.md"),
    "# Hello\n\nThis   is   spaced   out.\n",
  )
  // Outside-root target for path-traversal tests
  fs.writeFileSync(path.join(OUTSIDE_ROOT, "secret.txt"), "outside the repo\n")
})

afterAll(() => {
  fs.rmSync(REPO_ROOT, { recursive: true, force: true })
  fs.rmSync(OUTSIDE_ROOT, { recursive: true, force: true })
})

// ── Unit: validateCitation happy paths + edges ────────────────────────

describe("validateCitation", () => {
  it("passes a citation whose snippet matches the cited lines literally", () => {
    const cache = createFileCache()
    const c: ContextCitation = {
      file: "src/routes/auth.ts",
      startLine: 1,
      endLine: 1,
      snippet: "export function login",
    }
    const r = validateCitation(REPO_ROOT, c, cache)
    expect(r.ok).toBe(true)
  })

  it("fails when the file does not exist", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      { file: "src/does-not-exist.ts", startLine: 1, endLine: 1, snippet: "x" },
      cache,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not found/i)
  })

  it("fails when startLine is out of range", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      { file: "src/routes/auth.ts", startLine: 999, endLine: 1000, snippet: "x" },
      cache,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/out of range/i)
  })

  it("fails when endLine is out of range", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      { file: "src/routes/auth.ts", startLine: 1, endLine: 999, snippet: "x" },
      cache,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/out of range/i)
  })

  it("fails when endLine < startLine", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      { file: "src/routes/auth.ts", startLine: 3, endLine: 2, snippet: "x" },
      cache,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/endLine/)
  })

  it("fails when the snippet does not appear in the cited range", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      {
        file: "src/routes/auth.ts",
        startLine: 1,
        endLine: 2,
        snippet: "this text is not anywhere in the file",
      },
      cache,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/snippet not found/i)
  })

  it("matches snippets with collapsed whitespace", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      {
        file: "README.md",
        startLine: 3,
        endLine: 3,
        // README has multiple spaces; normalization collapses them.
        snippet: "This is spaced out.",
      },
      cache,
    )
    expect(r.ok).toBe(true)
  })

  it("preserves case sensitivity", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      {
        file: "src/routes/auth.ts",
        startLine: 1,
        endLine: 1,
        // Original is "export function login"; capitalized variant must fail.
        snippet: "EXPORT FUNCTION LOGIN",
      },
      cache,
    )
    expect(r.ok).toBe(false)
  })

  it("normalizes CRLF so Windows-saved files match LF-saved snippets", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      { file: "src/routes/crlf.ts", startLine: 2, endLine: 2, snippet: "line two" },
      cache,
    )
    expect(r.ok).toBe(true)
  })

  it("rejects path traversal outside the repo root", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      {
        file: "../../etc/passwd",
        startLine: 1,
        endLine: 1,
        snippet: "root",
      },
      cache,
    )
    expect(r.ok).toBe(false)
    // Either "escapes the repo root" (if path resolves out) or "not found"
    // (if the resolved path happens not to exist) — both are safe outcomes.
    expect(r.reason).toMatch(/escape|not found/i)
  })

  it("v2: passes a citation with no snippet — bounds check alone", () => {
    const cache = createFileCache()
    const c: ContextCitation = {
      file: "src/routes/auth.ts",
      startLine: 1,
      endLine: 2,
      reason: "declares the login endpoint",
    }
    const r = validateCitation(REPO_ROOT, c, cache)
    expect(r.ok).toBe(true)
  })

  it("v2: fails a snippet-less citation whose lines are out of range", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      { file: "src/routes/auth.ts", startLine: 500, endLine: 501 },
      cache,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/out of range/i)
  })

  it("v1 backcompat: still enforces literal-text match when snippet IS present", () => {
    const cache = createFileCache()
    const r = validateCitation(
      REPO_ROOT,
      {
        file: "src/routes/auth.ts",
        startLine: 1,
        endLine: 1,
        snippet: "this text does not appear anywhere",
      },
      cache,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/snippet not found/i)
  })

  it("uses the per-run cache so repeated citations into one file read the file once", () => {
    const cache = createFileCache()
    validateCitation(
      REPO_ROOT,
      { file: "src/routes/auth.ts", startLine: 1, endLine: 1, snippet: "export" },
      cache,
    )
    expect(cache.size).toBe(1)
    validateCitation(
      REPO_ROOT,
      { file: "src/routes/auth.ts", startLine: 2, endLine: 2, snippet: "Validates" },
      cache,
    )
    // Same file; should still be 1 entry in the cache.
    expect(cache.size).toBe(1)
  })
})

// ── Aggregation: validateArticleCitations ─────────────────────────────

describe("validateArticleCitations", () => {
  const article = {
    citations: [
      { file: "src/routes/auth.ts", startLine: 1, endLine: 1, snippet: "export function login" },
      { file: "src/routes/auth.ts", startLine: 2, endLine: 2, snippet: "Validates credentials" },
      { file: "src/routes/auth.ts", startLine: 3, endLine: 3, snippet: "missing credentials" },
      { file: "src/does-not-exist.ts", startLine: 1, endLine: 1, snippet: "nope" },
      { file: "src/routes/auth.ts", startLine: 999, endLine: 999, snippet: "oob" },
    ],
  }

  it("returns kept and dropped citations with reasons", () => {
    const cache = createFileCache()
    const r = validateArticleCitations(article, REPO_ROOT, cache)
    expect(r.kept).toHaveLength(3)
    expect(r.dropped).toHaveLength(2)
    expect(r.dropped.map((d) => d.reason).join("\n")).toMatch(/not found|out of range/i)
  })

  it("all citations valid → dropped is empty", () => {
    const cache = createFileCache()
    const allGood = {
      citations: [
        { file: "src/routes/auth.ts", startLine: 1, endLine: 1, snippet: "export" },
        { file: "src/routes/auth.ts", startLine: 2, endLine: 2, snippet: "Validates" },
      ],
    }
    const r = validateArticleCitations(allGood, REPO_ROOT, cache)
    expect(r.kept).toHaveLength(2)
    expect(r.dropped).toHaveLength(0)
  })

  it("zero valid citations → kept is empty (caller drops the doc)", () => {
    const cache = createFileCache()
    const allBad = {
      citations: [
        { file: "src/nope.ts", startLine: 1, endLine: 1, snippet: "x" },
        { file: "src/missing.ts", startLine: 1, endLine: 1, snippet: "y" },
      ],
    }
    const r = validateArticleCitations(allBad, REPO_ROOT, cache)
    expect(r.kept).toHaveLength(0)
    expect(r.dropped).toHaveLength(2)
  })

  it("shares the cache across multiple citations into the same file", () => {
    const cache = createFileCache()
    validateArticleCitations(article, REPO_ROOT, cache)
    // Only one file was successfully read (auth.ts); the missing file never
    // reached the cache. So size is 1 regardless of how many auth.ts
    // citations came in.
    expect(cache.size).toBe(1)
  })
})

// ── readFileForCitation direct unit ───────────────────────────────────

describe("readFileForCitation", () => {
  it("returns ok for a valid in-repo path", () => {
    const cache = createFileCache()
    const r = readFileForCitation(REPO_ROOT, "src/routes/auth.ts", cache)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.content).toContain("export function login")
  })

  it("normalizes CRLF to LF", () => {
    const cache = createFileCache()
    const r = readFileForCitation(REPO_ROOT, "src/routes/crlf.ts", cache)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.content).not.toContain("\r")
  })

  it("rejects absolute paths outside the repo", () => {
    const cache = createFileCache()
    const outsideFile = path.join(OUTSIDE_ROOT, "secret.txt")
    const r = readFileForCitation(REPO_ROOT, outsideFile, cache)
    expect(r.ok).toBe(false)
  })
})

describe("readSnippet", () => {
  it("returns disk bytes for a valid 1-based inclusive range", () => {
    const cache = createFileCache()
    const r = readSnippet(REPO_ROOT, "src/routes/auth.ts", 1, 2, cache)
    expect(r).not.toBeNull()
    expect(r).toContain("export function login")
    expect(r).toContain("Validates credentials")
  })

  it("returns null when the file is missing", () => {
    const cache = createFileCache()
    expect(readSnippet(REPO_ROOT, "src/ghost.ts", 1, 1, cache)).toBeNull()
  })

  it("returns null when the line range is out of bounds", () => {
    const cache = createFileCache()
    expect(readSnippet(REPO_ROOT, "src/routes/auth.ts", 99, 100, cache)).toBeNull()
  })

  it("returns null when startLine > endLine", () => {
    const cache = createFileCache()
    expect(readSnippet(REPO_ROOT, "src/routes/auth.ts", 3, 2, cache)).toBeNull()
  })

  it("normalizes CRLF so Windows-saved files read cleanly", () => {
    const cache = createFileCache()
    const r = readSnippet(REPO_ROOT, "src/routes/crlf.ts", 2, 2, cache)
    expect(r).toBe("line two")
  })
})

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeWhitespace("  hello   world \n foo ")).toBe("hello world foo")
  })

  it("preserves an already-normalized string", () => {
    expect(normalizeWhitespace("clean text")).toBe("clean text")
  })

  it("is idempotent", () => {
    const once = normalizeWhitespace("  a   b   c  ")
    expect(normalizeWhitespace(once)).toBe(once)
  })
})
