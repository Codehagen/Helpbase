import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { loadEnvFiles } from "../src/lib/env-loader.js"

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-envloader-"))
}

describe("env-loader", () => {
  const keysToCleanup = new Set<string>()

  function setKey(k: string, v: string | undefined) {
    keysToCleanup.add(k)
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }

  afterEach(() => {
    for (const k of keysToCleanup) delete process.env[k]
    keysToCleanup.clear()
  })

  it("loads KEY=value from .env.local in the project root", () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, "package.json"), "{}")
    fs.writeFileSync(path.join(root, ".env.local"), "AI_GATEWAY_API_KEY=xyz\n")
    setKey("AI_GATEWAY_API_KEY", undefined)

    const files = loadEnvFiles(root)
    expect(files).toHaveLength(1)
    expect(process.env.AI_GATEWAY_API_KEY).toBe("xyz")
  })

  it("shell env wins over .env.local", () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, "package.json"), "{}")
    fs.writeFileSync(path.join(root, ".env.local"), "MY_KEY=from_file\n")
    setKey("MY_KEY", "from_shell")

    loadEnvFiles(root)
    expect(process.env.MY_KEY).toBe("from_shell")
  })

  it("walks up from a subdir to find project root", () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, "package.json"), "{}")
    fs.writeFileSync(path.join(root, ".env.local"), "WALK_UP=yes\n")
    const sub = path.join(root, "a", "b", "c")
    fs.mkdirSync(sub, { recursive: true })
    setKey("WALK_UP", undefined)

    loadEnvFiles(sub)
    expect(process.env.WALK_UP).toBe("yes")
  })

  it("applies .env.local then .env with .env.local taking precedence", () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, "package.json"), "{}")
    fs.writeFileSync(path.join(root, ".env"), "SHARED=from_env\n")
    fs.writeFileSync(path.join(root, ".env.local"), "SHARED=from_local\n")
    setKey("SHARED", undefined)

    loadEnvFiles(root)
    expect(process.env.SHARED).toBe("from_local")
  })

  it("strips matching single and double quotes", () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, "package.json"), "{}")
    fs.writeFileSync(
      path.join(root, ".env.local"),
      'DQ="double value"\nSQ=\'single value\'\nPLAIN=plain\n',
    )
    for (const k of ["DQ", "SQ", "PLAIN"]) setKey(k, undefined)

    loadEnvFiles(root)
    expect(process.env.DQ).toBe("double value")
    expect(process.env.SQ).toBe("single value")
    expect(process.env.PLAIN).toBe("plain")
  })

  it("ignores comments and blank lines", () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, "package.json"), "{}")
    fs.writeFileSync(
      path.join(root, ".env.local"),
      "# a comment\n\nKEEP=yes\n# KEEP2=no\n",
    )
    setKey("KEEP", undefined)
    setKey("KEEP2", undefined)

    loadEnvFiles(root)
    expect(process.env.KEEP).toBe("yes")
    expect(process.env.KEEP2).toBeUndefined()
  })

  it("silently ignores malformed keys", () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, "package.json"), "{}")
    fs.writeFileSync(
      path.join(root, ".env.local"),
      "=noprefix\n1BAD=nope\nGOOD_KEY=ok\n",
    )
    for (const k of ["GOOD_KEY", "1BAD"]) setKey(k, undefined)

    loadEnvFiles(root)
    expect(process.env.GOOD_KEY).toBe("ok")
    expect(process.env["1BAD"]).toBeUndefined()
  })

  it("returns [] when no env files exist", () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, "package.json"), "{}")
    const files = loadEnvFiles(root)
    expect(files).toEqual([])
  })
})
