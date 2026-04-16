import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  readContextSources,
  totalChars,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_CONTEXT_EXTENSIONS,
} from "../context-reader.js"

let ROOT: string

beforeAll(() => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ctxreader-"))
  // Markdown + code files that SHOULD be read
  fs.writeFileSync(path.join(ROOT, "README.md"), "# Sample project\n\nA tiny repo for tests.\n")
  fs.mkdirSync(path.join(ROOT, "src", "routes"), { recursive: true })
  fs.writeFileSync(
    path.join(ROOT, "src", "routes", "auth.ts"),
    "export function login() {}\n",
  )
  fs.writeFileSync(
    path.join(ROOT, "src", "routes", "users.py"),
    "def get_user(id): return {}\n",
  )
  fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true })
  fs.writeFileSync(
    path.join(ROOT, "docs", "guide.md"),
    "# Guide\n",
  )
  // Secret-shaped files — MUST be skipped at the walker (secrets gate)
  fs.mkdirSync(path.join(ROOT, "config"), { recursive: true })
  fs.writeFileSync(path.join(ROOT, ".env"), "SECRET_ENV_CONTENT\n")
  fs.writeFileSync(path.join(ROOT, ".env.local"), "SECRET_LOCAL\n")
  fs.writeFileSync(path.join(ROOT, "config", "secret.pem"), "-----BEGIN PRIVATE KEY-----")
  // Skip-list dirs — MUST NOT be read
  fs.mkdirSync(path.join(ROOT, "node_modules", "lodash"), { recursive: true })
  fs.writeFileSync(path.join(ROOT, "node_modules", "lodash", "index.js"), "module.exports = {}")
  fs.mkdirSync(path.join(ROOT, ".git"), { recursive: true })
  fs.writeFileSync(path.join(ROOT, ".git", "HEAD"), "ref: main")
  // CRLF file — MUST normalize to LF
  fs.writeFileSync(path.join(ROOT, "crlf-notes.md"), "line one\r\nline two\r\n")
  // Excluded extension (must NOT be read by default)
  fs.writeFileSync(path.join(ROOT, "data.json"), '{"key": "value"}')
})

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true })
})

describe("readContextSources", () => {
  it("includes markdown + selected code extensions by default", () => {
    const sources = readContextSources(ROOT)
    const paths = sources.map((s) => s.path).sort()
    expect(paths).toContain("README.md")
    expect(paths).toContain("src/routes/auth.ts")
    expect(paths).toContain("src/routes/users.py")
    expect(paths).toContain("docs/guide.md")
    expect(paths).toContain("crlf-notes.md")
  })

  it("excludes files outside the extension allowlist by default", () => {
    const sources = readContextSources(ROOT)
    const paths = sources.map((s) => s.path)
    expect(paths).not.toContain("data.json")
  })

  it("excludes secret-named files (gate 1)", () => {
    const sources = readContextSources(ROOT)
    const paths = sources.map((s) => s.path)
    expect(paths).not.toContain(".env")
    expect(paths).not.toContain(".env.local")
    expect(paths).not.toContain("config/secret.pem")
  })

  it("skips build/VCS directories", () => {
    const sources = readContextSources(ROOT)
    const paths = sources.map((s) => s.path)
    // No node_modules or .git content makes it through
    expect(paths.some((p) => p.startsWith("node_modules/"))).toBe(false)
    expect(paths.some((p) => p.startsWith(".git/"))).toBe(false)
  })

  it("normalizes CRLF to LF on read", () => {
    const sources = readContextSources(ROOT)
    const crlf = sources.find((s) => s.path === "crlf-notes.md")!
    expect(crlf).toBeDefined()
    expect(crlf.content).not.toContain("\r")
    expect(crlf.content).toContain("line one\nline two")
  })

  it("returns per-file lineCount + ext", () => {
    const sources = readContextSources(ROOT)
    const auth = sources.find((s) => s.path === "src/routes/auth.ts")!
    expect(auth.ext).toBe(".ts")
    expect(auth.lineCount).toBeGreaterThan(0)
  })

  it("sorts README-like files first, then shallow paths, then alpha", () => {
    const sources = readContextSources(ROOT)
    // README.md should be at index 0
    expect(sources[0]!.path).toBe("README.md")
  })

  it("honors a custom extension allowlist", () => {
    const sources = readContextSources(ROOT, { extensions: [".md"] })
    const paths = sources.map((s) => s.path)
    expect(paths).toContain("README.md")
    expect(paths).not.toContain("src/routes/auth.ts")
  })

  it("replaces oversized files with a placeholder + lineCount 1", () => {
    const huge = "a\n".repeat(DEFAULT_MAX_FILE_BYTES) // 2× cap at minimum
    const hugePath = path.join(ROOT, "huge.md")
    fs.writeFileSync(hugePath, huge)
    try {
      const sources = readContextSources(ROOT)
      const e = sources.find((s) => s.path === "huge.md")!
      expect(e).toBeDefined()
      expect(e.content).toContain("[file too large, skipped")
      expect(e.lineCount).toBe(1)
    } finally {
      fs.rmSync(hugePath)
    }
  })

  it("DEFAULT_CONTEXT_EXTENSIONS covers all major code-language + markdown", () => {
    const exts = new Set(DEFAULT_CONTEXT_EXTENSIONS)
    expect(exts.has(".md")).toBe(true)
    expect(exts.has(".mdx")).toBe(true)
    expect(exts.has(".ts")).toBe(true)
    expect(exts.has(".py")).toBe(true)
    expect(exts.has(".go")).toBe(true)
    expect(exts.has(".rs")).toBe(true)
  })
})

describe("totalChars", () => {
  it("sums content length across sources", () => {
    const sources = readContextSources(ROOT)
    const total = totalChars(sources)
    const manual = sources.reduce((acc, s) => acc + s.content.length, 0)
    expect(total).toBe(manual)
  })

  it("returns 0 for an empty source list", () => {
    expect(totalChars([])).toBe(0)
  })
})
