import { Command } from "commander"
import { spawn } from "node:child_process"
import pc from "picocolors"
import { HelpbaseError } from "../lib/errors.js"
import { info, note } from "../lib/ui.js"

/**
 * `helpbase mcp` — manage the self-hosted Model Context Protocol server.
 *
 *   helpbase mcp start              stdio transport (local clients)
 *   helpbase mcp start --http       HTTP transport with bearer auth
 *
 * Both modes shell out to the `@helpbase/mcp` package via `npx -y`. The CLI
 * does not bundle the MCP runtime — we keep it as a separate npm package so
 * it can ship independently and be `shadcn add`-ed as source code.
 */

export const mcpCommand = new Command("mcp")
  .description("Run the Helpbase MCP server (stdio or HTTP)")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase mcp start                    # stdio — Claude Desktop / Cursor / Zed
  $ helpbase mcp start --http             # HTTP — remote agents, internal KB
  $ helpbase mcp start --http --port 4000 # custom port

HTTP mode reads two env vars:
  HELPBASE_MCP_TOKEN              required — bearer token for auth
  HELPBASE_MCP_ALLOWED_ORIGINS    optional — comma-separated CORS allowlist
`,
  )

mcpCommand
  .command("start")
  .description("Start the MCP server")
  .option("--http", "Use HTTP transport instead of stdio")
  .option("--port <number>", "Port for HTTP mode (default: 3000)")
  .option("--content <dir>", "MDX content directory (sets HELPBASE_CONTENT_DIR)")
  .action(async (opts: { http?: boolean; port?: string; content?: string }) => {
    const bin = opts.http ? "helpbase-mcp-http" : "helpbase-mcp"

    // HTTP mode fails fast if the token is missing — clearer error than
    // letting the child process throw on boot.
    if (opts.http && !process.env.HELPBASE_MCP_TOKEN) {
      throw new HelpbaseError({
        code: "E_NO_MCP_TOKEN",
        problem: "HELPBASE_MCP_TOKEN is not set",
        cause:
          "The HTTP MCP transport refuses to run unauthenticated. Exposing an open MCP endpoint is a footgun we won't ship.",
        fix: [
          `Generate a token: ${pc.cyan(`export HELPBASE_MCP_TOKEN="$(openssl rand -hex 32)"`)}`,
          "Then re-run this command.",
        ],
      })
    }

    const env = { ...process.env }
    if (opts.content) env.HELPBASE_CONTENT_DIR = opts.content
    if (opts.port) env.PORT = opts.port

    // In stdio mode we must NOT write anything decorative — stdio is the
    // JSON-RPC stream. In HTTP mode a banner is fine on stderr.
    if (opts.http) {
      info(`Launching ${pc.cyan(bin)} (HTTP transport)`)
      note("")
    }

    // `npx -y --package @helpbase/mcp@latest -- <bin>` selects the specific
    // binary from the package. No local install needed.
    const child = spawn(
      "npx",
      ["-y", "--package", "@helpbase/mcp@latest", "--", bin],
      { stdio: "inherit", env },
    )

    child.on("exit", (code) => process.exit(code ?? 0))
    child.on("error", (err) => {
      throw new HelpbaseError({
        code: "E_NETWORK",
        problem: `Failed to launch ${bin}`,
        cause: err.message,
        fix: [
          "Check your network — npx fetches @helpbase/mcp on first run.",
          "If offline, install it globally: `npm i -g @helpbase/mcp`.",
        ],
      })
    })
  })
