import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { writeAiGatewayKey } from "../src/env-local.js"

const tempDirs: string[] = []

function mkTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "create-helpbase-env-"))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("writeAiGatewayKey", () => {
  it("creates .env.local with the key when the file doesn't exist", () => {
    const dir = mkTempDir()
    writeAiGatewayKey(dir, "sk-test-123")
    const contents = fs.readFileSync(path.join(dir, ".env.local"), "utf-8")
    expect(contents).toBe("AI_GATEWAY_API_KEY=sk-test-123\n")
  })

  it("appends the key when .env.local exists without it", () => {
    const dir = mkTempDir()
    fs.writeFileSync(path.join(dir, ".env.local"), "FOO=bar\n")
    writeAiGatewayKey(dir, "sk-xyz")
    const contents = fs.readFileSync(path.join(dir, ".env.local"), "utf-8")
    expect(contents).toContain("FOO=bar")
    expect(contents).toContain("AI_GATEWAY_API_KEY=sk-xyz")
  })

  it("replaces the existing AI_GATEWAY_API_KEY line", () => {
    const dir = mkTempDir()
    fs.writeFileSync(
      path.join(dir, ".env.local"),
      "FOO=bar\nAI_GATEWAY_API_KEY=old\nBAZ=qux\n",
    )
    writeAiGatewayKey(dir, "new-key")
    const contents = fs.readFileSync(path.join(dir, ".env.local"), "utf-8")
    expect(contents).toContain("AI_GATEWAY_API_KEY=new-key")
    expect(contents).not.toContain("old")
    expect(contents).toContain("FOO=bar")
    expect(contents).toContain("BAZ=qux")
  })
})
