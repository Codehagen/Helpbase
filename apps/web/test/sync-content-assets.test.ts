import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync } from "node:child_process"

const SCRIPT_PATH = path.resolve(__dirname, "../scripts/sync-content-assets.mjs")

function run(
  cwd: string,
  env?: Record<string, string>,
): { stdout: string; exitCode: number } {
  // Strip HELPBASE_SKIP_SYNC from parent env so it doesn't leak into tests
  const { HELPBASE_SKIP_SYNC: _, ...cleanEnv } = process.env
  try {
    const stdout = execSync(`node ${SCRIPT_PATH}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...cleanEnv, ...env },
    })
    return { stdout, exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: (err.stdout ?? "") + (err.stderr ?? ""),
      exitCode: err.status ?? 1,
    }
  }
}

describe("sync-content-assets", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-sync-"))
    // Create content dir structure
    fs.mkdirSync(path.join(tmpDir, "content"), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("copies assets from content/<cat>/<slug>/ to public/_helpbase-assets/", () => {
    const assetDir = path.join(tmpDir, "content", "guides", "setup")
    fs.mkdirSync(assetDir, { recursive: true })
    fs.writeFileSync(path.join(assetDir, "hero.png"), "fake-png-data")

    // Need a .mdx file in the category
    fs.writeFileSync(
      path.join(tmpDir, "content", "guides", "setup.mdx"),
      "---\nschemaVersion: 1\ntitle: T\ndescription: D\n---\n# Test",
    )

    const result = run(tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Synced 1 asset")

    const copied = path.join(tmpDir, "public", "_helpbase-assets", "guides", "setup", "hero.png")
    expect(fs.existsSync(copied)).toBe(true)
  })

  it("creates sentinel file on first run", () => {
    const result = run(tmpDir)
    expect(result.exitCode).toBe(0)

    const sentinel = path.join(tmpDir, "public", "_helpbase-assets", ".helpbase-managed")
    expect(fs.existsSync(sentinel)).toBe(true)
  })

  it("refuses to nuke without sentinel", () => {
    // Manually create target dir without sentinel
    const targetDir = path.join(tmpDir, "public", "_helpbase-assets")
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(path.join(targetDir, "user-file.txt"), "important")

    const result = run(tmpDir)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("sentinel")
  })

  it("nuke-and-rebuild removes stale files", () => {
    // First run: create a file
    const targetDir = path.join(tmpDir, "public", "_helpbase-assets")
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(
      path.join(targetDir, ".helpbase-managed"),
      "managed by sync-content-assets\n",
    )
    fs.writeFileSync(path.join(targetDir, "stale.png"), "stale")

    // Run sync (no assets to copy)
    const result = run(tmpDir)
    expect(result.exitCode).toBe(0)

    // Stale file should be gone
    expect(fs.existsSync(path.join(targetDir, "stale.png"))).toBe(false)
    // Sentinel should exist again
    expect(fs.existsSync(path.join(targetDir, ".helpbase-managed"))).toBe(true)
  })

  it("skips entirely with HELPBASE_SKIP_SYNC=1", () => {
    const result = run(tmpDir, { HELPBASE_SKIP_SYNC: "1" })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("HELPBASE_SKIP_SYNC")
  })

  it("handles empty content directory gracefully", () => {
    const result = run(tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Synced 0 asset")
  })

  it("fails when frontmatter heroImage references missing file", () => {
    const catDir = path.join(tmpDir, "content", "guides")
    fs.mkdirSync(catDir, { recursive: true })
    fs.writeFileSync(
      path.join(catDir, "setup.mdx"),
      '---\nschemaVersion: 1\ntitle: T\ndescription: D\nheroImage: "missing.png"\n---\n# Test',
    )

    const result = run(tmpDir)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("heroImage")
    expect(result.stdout).toContain("missing.png")
  })
})
