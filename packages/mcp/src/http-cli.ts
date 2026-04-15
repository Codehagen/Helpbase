#!/usr/bin/env node
/**
 * `@helpbase/mcp` — HTTP entry point (installable as `helpbase-mcp-http`).
 *
 * Reads:
 *   HELPBASE_MCP_TOKEN              (required — bearer auth)
 *   HELPBASE_MCP_ALLOWED_ORIGINS    (optional — CORS allowlist, comma-separated)
 *   HELPBASE_CONTENT_DIR            (optional — where MDX lives; default: auto-detect)
 *   PORT                            (optional — default: 3000)
 *
 * Fatal errors include the fix command and a doc URL so the first-time
 * developer experience doesn't black-hole on a missing env var.
 */

import { startHttpServer } from "./http.js"
import { HttpConfigError } from "./http.js"

async function main() {
  try {
    const handle = await startHttpServer()

    const shutdown = async (signal: string) => {
      process.stderr.write(`[helpbase-mcp] ${signal} received — closing\n`)
      await handle.close()
      process.exit(0)
    }
    process.once("SIGINT", () => shutdown("SIGINT"))
    process.once("SIGTERM", () => shutdown("SIGTERM"))
  } catch (err) {
    if (err instanceof HttpConfigError) {
      process.stderr.write(
        `✖ ${err.message} [${err.code}]\n` +
          `  fix: export HELPBASE_MCP_TOKEN="$(openssl rand -hex 32)"\n` +
          `  docs: https://helpbase.dev/errors/e-no-mcp-token\n`,
      )
      process.exit(2)
    }
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[helpbase-mcp] fatal: ${message}\n`)
    process.exit(1)
  }
}

main()
