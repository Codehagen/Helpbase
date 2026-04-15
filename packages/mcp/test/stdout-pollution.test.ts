import { describe, it, expect } from "vitest"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * CRITICAL REGRESSION TEST.
 *
 * Under stdio transport, stdout carries the JSON-RPC message stream. Any stray
 * write to stdout (console.log, package banner, dotenv's "Suite" log, etc.)
 * breaks MCP clients silently — they see a parse error and have no idea why.
 *
 * This test spawns the real entry point as a subprocess, sends a valid
 * JSON-RPC `initialize` request, and asserts that every stdout line parses as
 * a valid JSON-RPC message. If ANY line fails to parse, the test fails —
 * that's the bug we're guarding against.
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ENTRY = path.resolve(__dirname, "..", "src", "index.ts")
const FIXTURE_ROOT = path.resolve(__dirname, "fixtures", "content")

// Run the ts source through a loader so we don't require a build step.
// `tsx` is commonly installed alongside vitest; if not, the test will error out
// with a clear message and we can add it as a devDependency.
function locateRunner(): string {
  return "tsx"
}

describe("stdio stdout hygiene (regression)", () => {
  it("emits only valid JSON-RPC on stdout; everything else goes to stderr", async () => {
    const runner = locateRunner()
    const child = spawn(runner, [ENTRY], {
      env: {
        ...process.env,
        HELPBASE_CONTENT_DIR: FIXTURE_ROOT,
      },
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdoutBuf = ""
    let stderrBuf = ""
    child.stdout.on("data", (d) => (stdoutBuf += d.toString()))
    child.stderr.on("data", (d) => (stderrBuf += d.toString()))

    // Send a valid MCP `initialize` request — the handshake every client sends first.
    const initializeRequest = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "stdout-hygiene-test", version: "1.0.0" },
      },
    }
    child.stdin.write(JSON.stringify(initializeRequest) + "\n")

    // Give the server a moment to respond.
    await new Promise((r) => setTimeout(r, 1500))

    // Also send tools/list to exercise more of the surface.
    const toolsListRequest = {
      jsonrpc: "2.0" as const,
      id: 2,
      method: "tools/list",
      params: {},
    }
    child.stdin.write(JSON.stringify(toolsListRequest) + "\n")
    await new Promise((r) => setTimeout(r, 1500))

    child.stdin.end()
    child.kill()

    // Every non-empty line on stdout must parse as JSON-RPC.
    const lines = stdoutBuf.split("\n").filter((l) => l.trim().length > 0)
    expect(lines.length).toBeGreaterThan(0)

    for (const line of lines) {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch (err) {
        throw new Error(
          `stdout line did not parse as JSON (stdout pollution regression):\n` +
            `  line: ${JSON.stringify(line)}\n` +
            `  stderr was: ${stderrBuf}`,
        )
      }
      expect(parsed).toMatchObject({ jsonrpc: "2.0" })
    }

    // Bootstrap summary should have gone to stderr, not stdout.
    expect(stderrBuf).toContain("[helpbase-mcp]")
    expect(stdoutBuf).not.toContain("[helpbase-mcp]")
  })
})
