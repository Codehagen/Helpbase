/**
 * HTTP transport for @helpbase/mcp.
 *
 * The stdio entry point (index.ts) is for local clients: Claude Desktop,
 * Cursor, Zed, Windsurf. The HTTP entry point is for remote agents and
 * for the hosted-tier use case — same server, same tools, different wire.
 *
 * Auth: bearer token from `HELPBASE_MCP_TOKEN`. If the env var is unset,
 * the server refuses to start — an unauthenticated MCP endpoint on the
 * open web is a footgun we do not ship.
 *
 * CORS: allowlist from `HELPBASE_MCP_ALLOWED_ORIGINS` (comma-separated).
 * Empty or unset → reject all cross-origin requests. `*` is explicitly
 * accepted as "allow any origin" for users who want that.
 *
 * This file is Node-only (imports node:http). Edge/worker deployment
 * would use the underlying `WebStandardStreamableHTTPServerTransport` from
 * the SDK directly.
 */

import http from "node:http"
import { randomUUID } from "node:crypto"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { buildServer, type BuildServerOptions } from "./server.js"

export interface HttpServerOptions extends BuildServerOptions {
  /** Port to listen on. Default: process.env.PORT or 3000. */
  port?: number
  /** Bearer token required on the Authorization header. If omitted, read from env. */
  token?: string
  /**
   * CORS origin allowlist. If omitted, read from env and split on commas.
   * Use ["*"] to allow any origin. Empty → all cross-origin requests rejected.
   */
  allowedOrigins?: string[]
  /** Path the MCP endpoint is served at. Default: "/mcp". */
  path?: string
}

export interface HttpServerHandle {
  server: http.Server
  port: number
  close(): Promise<void>
}

/** Thrown when the server can't start because required config is missing. */
export class HttpConfigError extends Error {
  constructor(
    message: string,
    public readonly code: "E_NO_MCP_TOKEN",
  ) {
    super(message)
    this.name = "HttpConfigError"
  }
}

export function resolveHttpConfig(opts: HttpServerOptions = {}): {
  port: number
  token: string
  allowedOrigins: string[]
  path: string
} {
  const token = opts.token ?? process.env.HELPBASE_MCP_TOKEN ?? ""
  if (!token) {
    throw new HttpConfigError(
      "HELPBASE_MCP_TOKEN is not set. The HTTP MCP transport refuses to run unauthenticated — set the env var or pass { token } explicitly.",
      "E_NO_MCP_TOKEN",
    )
  }

  const portEnv = process.env.PORT ? Number(process.env.PORT) : undefined
  const port = opts.port ?? portEnv ?? 3000

  const originsFromEnv = process.env.HELPBASE_MCP_ALLOWED_ORIGINS
    ? process.env.HELPBASE_MCP_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : []
  const allowedOrigins = opts.allowedOrigins ?? originsFromEnv

  const path = opts.path ?? "/mcp"
  return { port, token, allowedOrigins, path }
}

/**
 * Decide whether a request origin is allowed.
 *
 * Rules:
 * - Empty allowlist → same-origin only (no Origin header, or Origin matches host).
 *   Browsers set Origin on cross-origin XHR/fetch; curl/servers don't.
 * - "*" in the allowlist → all origins allowed.
 * - Otherwise → exact match required.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) return true // same-origin / server-to-server
  if (allowedOrigins.includes("*")) return true
  return allowedOrigins.includes(origin)
}

/**
 * Constant-time token comparison to avoid timing attacks. Length check first
 * — mismatched lengths are trivially different, so we short-circuit there
 * without leaking timing info beyond "wrong length."
 */
export function tokensEqual(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Extract the bearer token from an Authorization header. Returns null if
 * the header is missing or malformed. Case-insensitive on the "Bearer "
 * scheme keyword per RFC 6750.
 */
export function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const match = /^bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

export async function startHttpServer(
  opts: HttpServerOptions = {},
): Promise<HttpServerHandle> {
  const config = resolveHttpConfig(opts)
  const { server: mcpServer, deps } = buildServer(opts)

  // Stateful mode: the SDK generates a session ID per initialize. Clients
  // echo it back via Mcp-Session-Id header on subsequent requests.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  await mcpServer.connect(transport)

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

    // ── CORS preflight ────────────────────────────────────────────────
    const origin = req.headers.origin
    const originOk = isOriginAllowed(origin, config.allowedOrigins)

    if (origin && originOk) {
      res.setHeader("Access-Control-Allow-Origin", origin)
      res.setHeader("Access-Control-Allow-Credentials", "true")
      res.setHeader("Vary", "Origin")
    }

    if (req.method === "OPTIONS") {
      if (!originOk) {
        res.writeHead(403, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "origin not allowed" }))
        return
      }
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      )
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Mcp-Session-Id",
      )
      res.setHeader("Access-Control-Max-Age", "86400")
      res.writeHead(204)
      res.end()
      return
    }

    if (origin && !originOk) {
      res.writeHead(403, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "origin not allowed" }))
      return
    }

    // ── Health check (no auth, no MCP) ────────────────────────────────
    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          status: "ok",
          docs: deps.docs.length,
          categories: deps.categories.length,
        }),
      )
      return
    }

    // ── Auth ──────────────────────────────────────────────────────────
    const bearer = extractBearer(req.headers.authorization)
    if (!bearer || !tokensEqual(bearer, config.token)) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": "Bearer",
      })
      res.end(JSON.stringify({ error: "unauthorized" }))
      return
    }

    // ── MCP endpoint ──────────────────────────────────────────────────
    if (url.pathname !== config.path) {
      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "not found" }))
      return
    }

    try {
      await transport.handleRequest(req, res)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[helpbase-mcp] request error: ${message}\n`)
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "internal error" }))
      }
    }
  })

  await new Promise<void>((resolve) => httpServer.listen(config.port, resolve))
  const addr = httpServer.address()
  const actualPort =
    typeof addr === "object" && addr ? addr.port : config.port

  process.stderr.write(
    `[helpbase-mcp] HTTP transport listening on http://0.0.0.0:${actualPort}${config.path}\n` +
      `[helpbase-mcp] Loaded ${deps.docs.length} docs across ${deps.categories.length} categories from ${deps.contentDir}\n` +
      (config.allowedOrigins.length > 0
        ? `[helpbase-mcp] CORS allowed origins: ${config.allowedOrigins.join(", ")}\n`
        : `[helpbase-mcp] CORS: same-origin only (set HELPBASE_MCP_ALLOWED_ORIGINS to open)\n`),
  )

  return {
    server: httpServer,
    port: actualPort,
    close: () =>
      new Promise((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err)
          else resolve()
        })
        transport.close().catch(() => {})
      }),
  }
}
