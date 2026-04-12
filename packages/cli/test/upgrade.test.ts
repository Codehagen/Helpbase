import { describe, it, expect } from "vitest"
import path from "node:path"
import { execSync } from "node:child_process"
import { detectInstall, formatUpgradeMessage } from "../src/commands/upgrade.js"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

describe("upgrade install detection", () => {
  it("detects homebrew from cellar path", () => {
    const r = detectInstall({
      argv1: "/opt/homebrew/bin/helpbase",
      execPath: "/opt/homebrew/Cellar/node/22.0.0/bin/node",
    })
    expect(r.method).toBe("homebrew")
    expect(formatUpgradeMessage(r)).toBe("Detected: Homebrew. Run: brew upgrade helpbase")
  })

  it("detects npx from _npx path", () => {
    const r = detectInstall({
      argv1: "/Users/x/.npm/_npx/abc123/node_modules/.bin/helpbase",
    })
    expect(r.method).toBe("npx")
    expect(r.command).toBe("npx helpbase@latest")
  })

  it("detects pnpm global from user agent", () => {
    const r = detectInstall({
      userAgent: "pnpm/9.0.0 npm/? node/v22 darwin arm64",
    })
    expect(r.method).toBe("pnpm-global")
    expect(formatUpgradeMessage(r)).toBe(
      "Detected: pnpm global. Run: pnpm up -g helpbase",
    )
  })

  it("detects pnpm global from pnpm path", () => {
    const r = detectInstall({
      argv1: "/Users/x/Library/pnpm/global/5/node_modules/helpbase/dist/index.js",
    })
    expect(r.method).toBe("pnpm-global")
  })

  it("detects yarn global from .yarn path", () => {
    const r = detectInstall({
      argv1: "/Users/x/.yarn/bin/helpbase",
    })
    expect(r.method).toBe("yarn-global")
    expect(r.command).toBe("yarn global upgrade helpbase")
  })

  it("detects bun global from .bun path", () => {
    const r = detectInstall({
      argv1: "/Users/x/.bun/install/global/node_modules/helpbase/dist/index.js",
    })
    expect(r.method).toBe("bun-global")
    expect(r.command).toBe("bun update -g helpbase")
  })

  it("detects npm global from lib/node_modules path", () => {
    const r = detectInstall({
      argv1: "/usr/local/lib/node_modules/helpbase/dist/index.js",
    })
    expect(r.method).toBe("npm-global")
    expect(r.command).toBe("npm i -g helpbase@latest")
  })

  it("falls back to npm global for unknown paths", () => {
    const r = detectInstall({
      argv1: "/some/unknown/bin/helpbase",
    })
    expect(r.method).toBe("unknown")
    expect(r.command).toBe("npm i -g helpbase@latest")
  })
})

describe("helpbase upgrade command", () => {
  it("prints a Detected: ... Run: ... line to stdout", () => {
    const out = execSync(`node ${CLI_PATH} upgrade`, {
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    })
    expect(out).toMatch(/Detected:.+Run:.+helpbase/)
  })
})
