import { describe, it, expect } from "vitest"
import path from "node:path"
import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function run(args: string, cwd: string): string {
  // doctor prints to stdout (text) or via JSON. Capture both streams.
  return execSync(`node ${CLI_PATH} ${args}`, {
    encoding: "utf-8",
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
  })
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-doctor-"))
}

describe("helpbase doctor", () => {
  it("groups output by category with fix lines on failing checks", () => {
    const tmp = makeTempDir()
    const out = run("doctor --offline", tmp)
    // Category headings
    expect(out).toContain("Environment")
    expect(out).toContain("Project")
    expect(out).toContain("Account")
    // Skipped network category due to --offline
    expect(out).not.toContain("Network")
    // A broken project produces fix lines
    expect(out).toContain("fix:")
    expect(out).toMatch(/fix:\s*mkdir content/)
    expect(out).toMatch(/fix:\s*helpbase login/)
  })

  it("emits JSON with category + severity + fix fields", () => {
    const tmp = makeTempDir()
    const out = run("doctor --offline --format json", tmp)
    const parsed = JSON.parse(out) as Array<{
      label: string
      category: string
      severity: string
      value: string
      fix?: string
    }>
    expect(Array.isArray(parsed)).toBe(true)
    const categories = new Set(parsed.map((c) => c.category))
    expect(categories.has("environment")).toBe(true)
    expect(categories.has("project")).toBe(true)
    expect(categories.has("account")).toBe(true)
    // content/ missing should carry a fix
    const contentCheck = parsed.find((c) => c.label === "content/")
    expect(contentCheck?.severity).toBe("warn")
    expect(contentCheck?.fix).toBeTruthy()
  })

  it("includes network category unless --offline is passed", () => {
    const tmp = makeTempDir()
    const out = run("doctor --format json", tmp)
    const parsed = JSON.parse(out) as Array<{ category: string; label: string }>
    const hasNetwork = parsed.some((c) => c.category === "network")
    expect(hasNetwork).toBe(true)
  }, 10_000) // external network call, guard with generous timeout

  it("exposes --offline in help text", () => {
    const out = execSync(`node ${CLI_PATH} doctor --help`, {
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    })
    expect(out).toContain("--offline")
  })
})
