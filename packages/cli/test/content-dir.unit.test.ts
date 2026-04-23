import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

import {
  CONTENT_DIR_CANDIDATES,
  findContentDir,
} from "../src/lib/content-dir.ts"

/**
 * Unit tests for findContentDir — the zero-config content-dir auto-discovery
 * added in helpbase@0.8.3. Without this, `helpbase sync` would default to
 * "content/" and fail for every project on a different layout (fumadocs in
 * content/docs/, monorepos in apps/web/content/, etc.).
 *
 * Asserts the fallback order matches packages/mcp/src/content/loader.ts —
 * both loaders must agree or the MCP server and the sync CLI will pick
 * different directories on the same repo.
 */

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-content-dir-"))
}

function mkdirp(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

let tmps: string[] = []

beforeEach(() => {
  tmps = []
  delete process.env.HELPBASE_CONTENT_DIR
})

afterEach(() => {
  for (const dir of tmps) fs.rmSync(dir, { recursive: true, force: true })
  delete process.env.HELPBASE_CONTENT_DIR
})

function newRepo(): string {
  const dir = mkTmp()
  tmps.push(dir)
  return fs.realpathSync(dir)
}

describe("findContentDir", () => {
  it("mirrors the MCP loader candidate order (monorepo first, fumadocs second, flat last)", () => {
    expect(CONTENT_DIR_CANDIDATES).toEqual([
      "apps/web/content",
      "content/docs",
      "content",
    ])
  })

  it("finds a flat content/ directory", () => {
    const repo = newRepo()
    mkdirp(path.join(repo, "content"))
    expect(findContentDir(repo)).toBe(path.join(repo, "content"))
  })

  it("finds content/docs/ (the fumadocs layout)", () => {
    const repo = newRepo()
    mkdirp(path.join(repo, "content/docs"))
    expect(findContentDir(repo)).toBe(path.join(repo, "content/docs"))
  })

  it("prefers content/docs/ over a sibling content/ (docs-in-subfolder wins)", () => {
    const repo = newRepo()
    mkdirp(path.join(repo, "content"))
    mkdirp(path.join(repo, "content/docs"))
    expect(findContentDir(repo)).toBe(path.join(repo, "content/docs"))
  })

  it("finds apps/web/content/ (the monorepo layout)", () => {
    const repo = newRepo()
    mkdirp(path.join(repo, "apps/web/content"))
    expect(findContentDir(repo)).toBe(path.join(repo, "apps/web/content"))
  })

  it("prefers apps/web/content/ over a sibling content/docs/ at the repo root", () => {
    const repo = newRepo()
    mkdirp(path.join(repo, "apps/web/content"))
    mkdirp(path.join(repo, "content/docs"))
    expect(findContentDir(repo)).toBe(path.join(repo, "apps/web/content"))
  })

  it("walks up from a subdirectory to find the root content dir", () => {
    const repo = newRepo()
    mkdirp(path.join(repo, "content/docs"))
    const nested = path.join(repo, "packages", "some-pkg", "src")
    mkdirp(nested)
    expect(findContentDir(nested)).toBe(path.join(repo, "content/docs"))
  })

  it("returns null when no candidate exists anywhere up the tree", () => {
    const repo = newRepo()
    mkdirp(path.join(repo, "src"))
    mkdirp(path.join(repo, "packages/cli/src"))
    expect(findContentDir(path.join(repo, "packages/cli/src"))).toBeNull()
  })

  it("honors HELPBASE_CONTENT_DIR (absolute path)", () => {
    const repo = newRepo()
    const custom = path.join(repo, "my-weird-docs")
    mkdirp(custom)
    process.env.HELPBASE_CONTENT_DIR = custom
    expect(findContentDir(repo)).toBe(custom)
  })

  it("honors HELPBASE_CONTENT_DIR (relative to startDir)", () => {
    const repo = newRepo()
    mkdirp(path.join(repo, "my-weird-docs"))
    process.env.HELPBASE_CONTENT_DIR = "my-weird-docs"
    expect(findContentDir(repo)).toBe(path.join(repo, "my-weird-docs"))
  })

  it("returns null if HELPBASE_CONTENT_DIR points at a non-existent path (don't silently fall back)", () => {
    const repo = newRepo()
    mkdirp(path.join(repo, "content"))
    process.env.HELPBASE_CONTENT_DIR = "does-not-exist"
    expect(findContentDir(repo)).toBeNull()
  })

  it("returns null if HELPBASE_CONTENT_DIR points at a file, not a directory", () => {
    const repo = newRepo()
    const filePath = path.join(repo, "not-a-dir")
    fs.writeFileSync(filePath, "x")
    process.env.HELPBASE_CONTENT_DIR = filePath
    expect(findContentDir(repo)).toBeNull()
  })
})
