import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  readProjectConfig,
  writeProjectConfig,
  removeProjectConfig,
  getProjectConfigPath,
} from "../src/lib/project-config.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-pc-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("project-config", () => {
  it("returns null when no config exists", () => {
    expect(readProjectConfig(tmpDir)).toBeNull()
  })

  it("writes and reads a config round-trip", () => {
    writeProjectConfig({ tenantId: "abc", slug: "my-product" }, tmpDir)
    expect(readProjectConfig(tmpDir)).toEqual({
      tenantId: "abc",
      slug: "my-product",
    })
  })

  it("creates .helpbase/ directory on write", () => {
    writeProjectConfig({ tenantId: "t", slug: "s" }, tmpDir)
    expect(fs.existsSync(path.join(tmpDir, ".helpbase"))).toBe(true)
  })

  it("writes JSON with a trailing newline and stable shape", () => {
    writeProjectConfig({ tenantId: "t1", slug: "s1" }, tmpDir)
    const raw = fs.readFileSync(getProjectConfigPath(tmpDir), "utf-8")
    expect(raw.endsWith("\n")).toBe(true)
    expect(JSON.parse(raw)).toEqual({ tenantId: "t1", slug: "s1" })
  })

  it("returns null for malformed JSON", () => {
    fs.mkdirSync(path.join(tmpDir, ".helpbase"))
    fs.writeFileSync(getProjectConfigPath(tmpDir), "{ not json")
    expect(readProjectConfig(tmpDir)).toBeNull()
  })

  it("returns null when required fields are missing", () => {
    fs.mkdirSync(path.join(tmpDir, ".helpbase"))
    fs.writeFileSync(
      getProjectConfigPath(tmpDir),
      JSON.stringify({ tenantId: "only" }),
    )
    expect(readProjectConfig(tmpDir)).toBeNull()
  })

  it("removeProjectConfig returns true when it removed something", () => {
    writeProjectConfig({ tenantId: "x", slug: "y" }, tmpDir)
    expect(removeProjectConfig(tmpDir)).toBe(true)
    expect(readProjectConfig(tmpDir)).toBeNull()
  })

  it("removeProjectConfig returns false when nothing to remove", () => {
    expect(removeProjectConfig(tmpDir)).toBe(false)
  })
})
