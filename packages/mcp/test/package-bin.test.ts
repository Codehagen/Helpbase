import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * CRITICAL REGRESSION TEST.
 *
 * The CLI-emitted `mcp.json` tells users (and Claude Desktop / Cursor /
 * Claude Code) to run the server via `npx -y @helpbase/mcp@latest`. npx
 * resolves a scoped package by stripping the scope and looking up a
 * binary with the bare name — in our case, `mcp`. If `bin.mcp` is
 * missing, `npx @helpbase/mcp` fails with the cryptic error
 * "could not determine executable to run", the server never starts,
 * and every user who pastes our generated config sees a broken MCP
 * endpoint. v0.1.0 shipped with this bug.
 *
 * This test pins the bin convention so it can never silently regress.
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PKG_PATH = path.resolve(__dirname, "../package.json")

describe("@helpbase/mcp package.json bin convention", () => {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8")) as {
    name: string
    version: string
    bin: Record<string, string>
  }

  it("exposes `mcp` as the scope-trimmed default so `npx @helpbase/mcp` works", () => {
    expect(pkg.bin).toHaveProperty("mcp")
  })

  it("points the default `mcp` bin at the stdio server entry, not http or build-index", () => {
    expect(pkg.bin.mcp).toBe("dist/index.js")
  })

  it("keeps the explicit `helpbase-mcp` alias for globally-installed use", () => {
    expect(pkg.bin).toHaveProperty("helpbase-mcp")
    expect(pkg.bin["helpbase-mcp"]).toBe(pkg.bin.mcp)
  })

  it("server.ts's hardcoded version default matches package.json", async () => {
    // The McpServer reports serverInfo.version over JSON-RPC. If the
    // source default drifts from the package.json version, clients get a
    // lying serverInfo. Pin them together. Update server.ts alongside
    // every package.json version bump.
    const serverSrc = fs.readFileSync(
      path.resolve(__dirname, "../src/server.ts"),
      "utf8",
    )
    const match = serverSrc.match(/version:\s*options\.version\s*\?\?\s*"([^"]+)"/)
    expect(match, "version default in server.ts is shaped as expected").not.toBeNull()
    expect(match![1]).toBe(pkg.version as string)
  })
})
