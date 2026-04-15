import { afterEach, beforeEach, describe, expect, it } from "vitest"
import path from "node:path"
import {
  extractBearer,
  isOriginAllowed,
  resolveHttpConfig,
  startHttpServer,
  tokensEqual,
  type HttpServerHandle,
  HttpConfigError,
} from "../src/http.js"

const FIXTURE_ROOT = path.join(__dirname, "fixtures", "content")
const TEST_TOKEN = "test-token-" + "x".repeat(40)

describe("resolveHttpConfig", () => {
  const originalEnv = { ...process.env }
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("throws HttpConfigError when HELPBASE_MCP_TOKEN is unset", () => {
    delete process.env.HELPBASE_MCP_TOKEN
    expect(() => resolveHttpConfig()).toThrow(HttpConfigError)
  })

  it("uses HELPBASE_MCP_TOKEN from env", () => {
    process.env.HELPBASE_MCP_TOKEN = TEST_TOKEN
    const config = resolveHttpConfig()
    expect(config.token).toBe(TEST_TOKEN)
  })

  it("prefers explicit token option over env", () => {
    process.env.HELPBASE_MCP_TOKEN = "env-token-" + "y".repeat(40)
    const config = resolveHttpConfig({ token: TEST_TOKEN })
    expect(config.token).toBe(TEST_TOKEN)
  })

  it("parses comma-separated HELPBASE_MCP_ALLOWED_ORIGINS", () => {
    process.env.HELPBASE_MCP_TOKEN = TEST_TOKEN
    process.env.HELPBASE_MCP_ALLOWED_ORIGINS =
      "https://agent.example.com, https://other.example.com ,https://third.example.com"
    const config = resolveHttpConfig()
    expect(config.allowedOrigins).toEqual([
      "https://agent.example.com",
      "https://other.example.com",
      "https://third.example.com",
    ])
  })

  it("defaults port to 3000 when PORT is unset", () => {
    process.env.HELPBASE_MCP_TOKEN = TEST_TOKEN
    delete process.env.PORT
    const config = resolveHttpConfig()
    expect(config.port).toBe(3000)
  })

  it("uses PORT env var when set", () => {
    process.env.HELPBASE_MCP_TOKEN = TEST_TOKEN
    process.env.PORT = "4242"
    const config = resolveHttpConfig()
    expect(config.port).toBe(4242)
  })

  it("defaults path to /mcp", () => {
    process.env.HELPBASE_MCP_TOKEN = TEST_TOKEN
    expect(resolveHttpConfig().path).toBe("/mcp")
  })
})

describe("extractBearer", () => {
  it("extracts the token from a well-formed header", () => {
    expect(extractBearer("Bearer abc123")).toBe("abc123")
  })

  it("is case-insensitive on the scheme", () => {
    expect(extractBearer("bearer abc")).toBe("abc")
    expect(extractBearer("BEARER abc")).toBe("abc")
  })

  it("trims surrounding whitespace", () => {
    expect(extractBearer("  Bearer   abc   ")).toBe("abc")
  })

  it("returns null for missing or malformed headers", () => {
    expect(extractBearer(undefined)).toBeNull()
    expect(extractBearer("")).toBeNull()
    expect(extractBearer("Basic abc")).toBeNull()
    expect(extractBearer("abc")).toBeNull()
  })
})

describe("tokensEqual", () => {
  it("returns true for identical strings", () => {
    expect(tokensEqual("abc", "abc")).toBe(true)
  })

  it("returns false for different strings of the same length", () => {
    expect(tokensEqual("abc", "abd")).toBe(false)
  })

  it("returns false for different lengths", () => {
    expect(tokensEqual("abc", "abcd")).toBe(false)
    expect(tokensEqual("", "a")).toBe(false)
  })

  it("returns true for two empty strings", () => {
    expect(tokensEqual("", "")).toBe(true)
  })
})

describe("isOriginAllowed", () => {
  it("allows no-origin requests (server-to-server / same-origin)", () => {
    expect(isOriginAllowed(undefined, [])).toBe(true)
  })

  it("allows any origin when allowlist includes *", () => {
    expect(isOriginAllowed("https://anything.example", ["*"])).toBe(true)
  })

  it("allows exact-match origins", () => {
    expect(
      isOriginAllowed("https://agent.example", ["https://agent.example"]),
    ).toBe(true)
  })

  it("rejects unlisted origins", () => {
    expect(
      isOriginAllowed("https://evil.example", ["https://agent.example"]),
    ).toBe(false)
  })

  it("rejects cross-origin requests when allowlist is empty", () => {
    expect(isOriginAllowed("https://agent.example", [])).toBe(false)
  })

  it("rejects substring matches (allowlist is exact-match)", () => {
    expect(
      isOriginAllowed(
        "https://agent.example.evil.com",
        ["https://agent.example"],
      ),
    ).toBe(false)
  })
})

describe("startHttpServer — integration", () => {
  let handle: HttpServerHandle | null = null

  beforeEach(() => {
    process.env.HELPBASE_MCP_TOKEN = TEST_TOKEN
  })

  afterEach(async () => {
    if (handle) {
      await handle.close()
      handle = null
    }
  })

  it("returns 401 on /mcp with no Authorization header", async () => {
    handle = await startHttpServer({ contentDir: FIXTURE_ROOT, port: 0 })
    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
    })
    expect(res.status).toBe(401)
    expect(res.headers.get("www-authenticate")).toBe("Bearer")
  })

  it("returns 401 with a wrong token", async () => {
    handle = await startHttpServer({ contentDir: FIXTURE_ROOT, port: 0 })
    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer the-wrong-token",
      },
      body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
    })
    expect(res.status).toBe(401)
  })

  it("/health returns 200 without auth", async () => {
    handle = await startHttpServer({ contentDir: FIXTURE_ROOT, port: 0 })
    const res = await fetch(`http://127.0.0.1:${handle.port}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
    expect(typeof body.docs).toBe("number")
  })

  it("returns 404 for unknown paths (with valid auth)", async () => {
    handle = await startHttpServer({ contentDir: FIXTURE_ROOT, port: 0 })
    const res = await fetch(`http://127.0.0.1:${handle.port}/nope`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    })
    expect(res.status).toBe(404)
  })

  it("refuses cross-origin requests when allowedOrigins is empty", async () => {
    handle = await startHttpServer({ contentDir: FIXTURE_ROOT, port: 0 })
    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
        Origin: "https://evil.example",
      },
      body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
    })
    expect(res.status).toBe(403)
  })

  it("CORS preflight returns 204 for allowed origin", async () => {
    handle = await startHttpServer({
      contentDir: FIXTURE_ROOT,
      port: 0,
      allowedOrigins: ["https://agent.example"],
    })
    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://agent.example",
        "Access-Control-Request-Method": "POST",
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://agent.example",
    )
    expect(res.headers.get("access-control-allow-methods")).toContain("POST")
  })

  it("CORS preflight returns 403 for disallowed origin", async () => {
    handle = await startHttpServer({
      contentDir: FIXTURE_ROOT,
      port: 0,
      allowedOrigins: ["https://agent.example"],
    })
    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
      },
    })
    expect(res.status).toBe(403)
  })

  it("throws HttpConfigError when token missing", async () => {
    delete process.env.HELPBASE_MCP_TOKEN
    await expect(
      startHttpServer({ contentDir: FIXTURE_ROOT, port: 0 }),
    ).rejects.toBeInstanceOf(HttpConfigError)
  })
})
