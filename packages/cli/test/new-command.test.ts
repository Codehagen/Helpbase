import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync } from "node:child_process"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function run(args: string, cwd: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    })
    return { stdout, exitCode: 0 }
  } catch (err: any) {
    return { stdout: (err.stdout ?? "") + (err.stderr ?? ""), exitCode: err.status ?? 1 }
  }
}

describe("helpbase new", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-new-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("creates a troubleshooting article with Steps + Callout + CardGroup", () => {
    const result = run(
      `new --type troubleshooting --title "Fix broken builds" --dir content`,
      tmpDir,
    )
    expect(result.exitCode).toBe(0)

    const filePath = path.join(tmpDir, "content", "troubleshooting", "fix-broken-builds.mdx")
    expect(fs.existsSync(filePath)).toBe(true)

    const content = fs.readFileSync(filePath, "utf-8")
    expect(content).toContain("<Steps>")
    expect(content).toContain("<Callout")
    expect(content).toContain("<CardGroup")
    expect(content).toContain("schemaVersion: 1")
  })

  it("creates an asset directory alongside the article", () => {
    run(
      `new --type troubleshooting --title "Fix broken builds" --dir content`,
      tmpDir,
    )

    const assetDir = path.join(tmpDir, "content", "troubleshooting", "fix-broken-builds")
    expect(fs.existsSync(assetDir)).toBe(true)
    expect(fs.statSync(assetDir).isDirectory()).toBe(true)
  })

  it("rejects unknown template type with valid types list", () => {
    const result = run(
      `new --type nonexistent --title "Test" --dir content`,
      tmpDir,
    )
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("Unknown template type")
    expect(result.stdout).toContain("troubleshooting")
  })
})
