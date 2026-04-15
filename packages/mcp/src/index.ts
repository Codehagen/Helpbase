#!/usr/bin/env node

/**
 * `@helpbase/mcp` — stdio entry point.
 *
 * Spawned by an MCP client (Claude Desktop, Cursor, Zed, Windsurf, etc.)
 * Talks JSON-RPC over stdin/stdout. All logs go to stderr — writing anything
 * else to stdout corrupts the protocol stream.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { buildServer } from "./server.js"

async function main() {
  const { server, deps } = buildServer()

  // Always log the bootstrap summary to stderr so users can see it when they
  // run the server manually for debugging, without polluting stdout.
  process.stderr.write(
    `[helpbase-mcp] Loaded ${deps.docs.length} docs across ${deps.categories.length} categories from ${deps.contentDir}\n`,
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[helpbase-mcp] fatal: ${message}\n`)
  process.exit(1)
})
