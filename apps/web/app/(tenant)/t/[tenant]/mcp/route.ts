import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { buildServer } from "@helpbase/mcp"
import { tokensEqual, extractBearer } from "@helpbase/mcp/http"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { IncomingMessage, ServerResponse } from "node:http"
import { Socket } from "node:net"
import type { Database } from "@/types/supabase"
import {
  enforceIpRateLimit,
  enforceTenantDailyCap,
  extractClientIp,
} from "@/lib/rate-limit"

/**
 * Public HTTP MCP endpoint for a hosted tenant.
 *
 *   POST/GET/DELETE  /t/{tenant}/mcp
 *
 * Auth: bearer token on Authorization header, validated constant-time
 * against `tenants.mcp_public_token`. Per-tenant shared token (v1) — any
 * party with the config can query.
 *
 * Content: fetched from Supabase via the service-role key + an explicit
 * `WHERE tenant_id = $id AND active = true` filter. RLS does not gate
 * these reads by design (would block an anon MCP endpoint); the slug
 * filter + hardcoded route scope are the isolation boundary.
 *
 * Runtime: Node serverless (not Edge) — MCP SDK ships node:stream deps
 * and the HTTP transport's request/response shape maps cleanly to
 * Node's http types, not Web standards. Vercel function timeout: 60s
 * on Pro (required for the MCP route; apps/web pages stay on hobby).
 *
 * The singleton-transport bug flagged in the Day-0 spike is not a
 * concern here: each Vercel invocation creates a fresh transport.
 */

export const runtime = "nodejs"
export const maxDuration = 60 // Seconds; 10s on hobby, 60s on pro.
export const dynamic = "force-dynamic"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

type TenantForMcp = {
  id: string
  slug: string
  mcp_public_token: string
  active: boolean
}

async function loadTenant(
  client: ReturnType<typeof createClient<Database>>,
  slug: string,
): Promise<TenantForMcp | null> {
  const { data } = await client
    .from("tenants")
    .select("id, slug, mcp_public_token, active")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle()
  return data as TenantForMcp | null
}

type DocRow = {
  slug: string
  category: string
  title: string
  description: string
  file_path: string
  content: string
}
type CategoryRow = {
  slug: string
  title: string
  order: number
}

async function loadTenantDocs(
  client: ReturnType<typeof createClient<Database>>,
  tenantId: string,
): Promise<{ docs: DocRow[]; categories: CategoryRow[] }> {
  const [articlesRes, categoriesRes] = await Promise.all([
    client
      .from("tenant_articles")
      .select("slug, category, title, description, file_path, content")
      .eq("tenant_id", tenantId)
      .order("order", { ascending: true }),
    client
      .from("tenant_categories")
      .select("slug, title, order")
      .eq("tenant_id", tenantId)
      .order("order", { ascending: true }),
  ])
  return {
    docs: (articlesRes.data ?? []) as DocRow[],
    categories: (categoriesRes.data ?? []) as CategoryRow[],
  }
}

/**
 * Coerce anything the MCP SDK might pass to res.write/end into a proper
 * Buffer. Critical fix over the naive `Buffer.isBuffer ? chunk : Buffer.from(String(chunk))`
 * shape — Uint8Array (what the SDK actually emits in some paths) is NOT
 * a Node Buffer, and `String(uint8)` returns "123,34,..." (comma-joined
 * byte values), which then `Buffer.from(...)` happily wraps as ASCII.
 * That produced the garbled `123,34,106,...` response body we saw on the
 * first smoke run on 2026-04-16.
 */
function coerceChunk(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk
  if (chunk instanceof Uint8Array) return Buffer.from(chunk)
  if (chunk instanceof ArrayBuffer) return Buffer.from(new Uint8Array(chunk))
  if (typeof chunk === "string") return Buffer.from(chunk)
  return Buffer.from(String(chunk))
}

/**
 * Bridge Next.js Request → node:http IncomingMessage/ServerResponse
 * so the MCP SDK's StreamableHTTPServerTransport.handleRequest
 * (which expects node types) can drive the response.
 */
async function bridgeToNodeHttp(
  request: NextRequest,
  body: string,
): Promise<{ req: IncomingMessage; res: ServerResponse; collected: Promise<Response> }> {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.method = request.method
  req.url = request.nextUrl.pathname + request.nextUrl.search
  // The MCP SDK's Node transport delegates to @hono/node-server, which
  // builds its Web `Headers` from `incoming.rawHeaders` only (see
  // @hono/node-server/dist/request.js:newHeadersFromIncoming). A synthetic
  // IncomingMessage starts with rawHeaders = []; populating `req.headers`
  // alone leaves the bridged Request with zero headers, so every request
  // lost its Accept / Authorization / Content-Type and hit the SDK's
  // "Accept must include application/json + text/event-stream" 406.
  const rawHeaders: string[] = []
  request.headers.forEach((value, key) => {
    req.headers[key.toLowerCase()] = value
    rawHeaders.push(key, value)
  })
  req.rawHeaders = rawHeaders
  if (body) {
    req.push(body)
  }
  req.push(null)

  const res = new ServerResponse(req)
  const chunks: Buffer[] = []
  // Track headers through every path the SDK (via @hono/node-server's
  // listener) can use to set them: writeHead(status, headers), setHeader,
  // and initial writeHead with a headers object. We can't rely on
  // res.getHeaders() alone — writeHead with a headers arg bypasses
  // setHeader in some Node versions, leaving getHeaders() empty after
  // the response has been "sent." That was dropping Mcp-Session-Id on
  // initialize responses and forcing all follow-up calls into
  // "Server not initialized."
  const captured = new Headers()
  let capturedStatus = 200
  const appendHeader = (key: string, value: unknown) => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      for (const item of value) captured.append(key, String(item))
    } else {
      captured.set(key, String(value))
    }
  }

  const originalWriteHead = res.writeHead.bind(res)
  const originalSetHeader = res.setHeader.bind(res)
  const originalWrite = res.write.bind(res)
  const originalEnd = res.end.bind(res)

  res.setHeader = ((name: string, value: number | string | readonly string[]) => {
    appendHeader(name, value)
    return originalSetHeader(name, value)
  }) as typeof res.setHeader

  res.writeHead = ((...args: unknown[]) => {
    const [status, arg2, arg3] = args as [
      number,
      string | Record<string, unknown> | Array<[string, unknown]> | undefined,
      Record<string, unknown> | Array<[string, unknown]> | undefined,
    ]
    capturedStatus = status
    const headerArg =
      typeof arg2 === "string" || arg2 === undefined ? arg3 : arg2
    if (Array.isArray(headerArg)) {
      for (const entry of headerArg) {
        if (Array.isArray(entry)) appendHeader(String(entry[0]), entry[1])
      }
    } else if (headerArg && typeof headerArg === "object") {
      for (const [k, v] of Object.entries(headerArg)) appendHeader(k, v)
    }
    // @ts-expect-error: pass-through with original variadic shape
    return originalWriteHead(...args)
  }) as typeof res.writeHead

  let resolveCollected: (r: Response) => void
  const collected = new Promise<Response>((resolve) => {
    resolveCollected = resolve
  })

  res.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (chunk) chunks.push(coerceChunk(chunk))
    // @ts-expect-error: pass-through to original
    return originalWrite(chunk, ...rest)
  }) as typeof res.write
  res.end = ((chunk?: unknown, ...rest: unknown[]) => {
    if (chunk) chunks.push(coerceChunk(chunk))
    // @ts-expect-error: pass-through
    const r = originalEnd(chunk, ...rest)
    resolveCollected(
      new Response(Buffer.concat(chunks), {
        status: capturedStatus,
        headers: captured,
      }),
    )
    return r
  }) as typeof res.end

  return { req, res, collected }
}

async function handle(request: NextRequest, tenantSlug: string): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 })
  }

  const serviceClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const tenant = await loadTenant(serviceClient, tenantSlug)
  if (!tenant) {
    return NextResponse.json({ error: "tenant not found" }, { status: 404 })
  }

  // Auth: bearer token must match the per-tenant public token.
  const provided = extractBearer(request.headers.get("authorization") ?? undefined)
  if (!provided) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 })
  }
  if (!tokensEqual(provided, tenant.mcp_public_token)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 })
  }

  // Rate limits: per-IP burst (Vercel KV) + per-tenant daily cap (Supabase).
  // Fail-open on KV errors; per-tenant check reads current count before
  // incrementing async so this adds one DB round-trip per request.
  const clientIp = extractClientIp(request)
  const ipLimit = await enforceIpRateLimit(clientIp)
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded (per-IP burst)" },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
      },
    )
  }
  const tenantLimit = await enforceTenantDailyCap(serviceClient, tenant.id)
  if (!tenantLimit.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded (tenant daily cap)" },
      {
        status: 429,
        headers: { "Retry-After": String(tenantLimit.retryAfterSeconds) },
      },
    )
  }

  // Load content, transform to the Doc / CategoryMeta shape buildServer expects.
  const { docs, categories } = await loadTenantDocs(serviceClient, tenant.id)
  const mcpDocs = docs.map((d) => ({
    slug: d.slug,
    category: d.category,
    title: d.title,
    description: d.description,
    filePath: d.file_path,
    content: d.content,
  }))
  const mcpCategories = categories.map((c) => ({
    slug: c.slug,
    title: c.title,
    order: c.order,
  }))

  // Build a fresh MCP server scoped to this tenant, wire Streamable HTTP,
  // bridge through Node's http types so the SDK can drive the response.
  const { server } = buildServer({
    preloadedDocs: mcpDocs,
    preloadedCategories: mcpCategories,
  })
  // Stateless mode: Vercel serverless has no shared memory between
  // invocations, so per-request session tracking can't work. The SDK
  // supports this exactly: `sessionIdGenerator: undefined` skips
  // validateSession and treats every POST as a fresh, independent
  // request. Matches the upstream simpleStatelessStreamableHttp example.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  await server.connect(transport)

  const body = request.method === "POST" || request.method === "PUT" || request.method === "PATCH"
    ? await request.text()
    : ""

  const { req, res, collected } = await bridgeToNodeHttp(request, body)

  // Fire and forget; transport writes to `res` which we've intercepted.
  try {
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined)
  } catch (err) {
    if (!res.writableEnded) {
      res.statusCode = 500
      res.setHeader("content-type", "application/json")
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : "internal error",
          },
          id: null,
        }),
      )
    }
  }

  const response = await collected

  // Fire-and-forget query log for search_docs (instrumentation for week-1 FTS review).
  if (body) {
    try {
      const payload = JSON.parse(body) as { method?: string; params?: { name?: string; arguments?: { query?: string } } }
      if (payload.method === "tools/call" && payload.params?.name) {
        const name = payload.params.name
        if (name === "search_docs" || name === "get_doc" || name === "list_docs") {
          // Non-blocking; if it fails we don't want to break the response.
          void serviceClient
            .from("tenant_mcp_queries")
            .insert({
              tenant_id: tenant.id,
              tool_name: name,
              query: payload.params.arguments?.query ?? "",
              result_count: 0,
              matched: true,
            })
            .then(() => undefined)
        }
      }
    } catch {
      // malformed body — already surfaced via MCP response; don't double-log
    }
  }

  return response
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant } = await params
  return handle(request, tenant)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant } = await params
  return handle(request, tenant)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant } = await params
  return handle(request, tenant)
}
