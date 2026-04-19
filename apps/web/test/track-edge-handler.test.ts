import { describe, expect, it, vi } from "vitest"

import {
  ALLOWED_EVENTS,
  handleTrack,
  type InsertClient,
  sha256Hex,
} from "../../../supabase/functions/track/handler"

function makeClient(
  overrides: Partial<InsertClient> = {},
): InsertClient & { insert: ReturnType<typeof vi.fn> } {
  return {
    insert: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  } as InsertClient & { insert: ReturnType<typeof vi.fn> }
}

function makeReq(body: unknown, init: RequestInit = {}): Request {
  return new Request("https://example.com/functions/v1/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  })
}

describe("handleTrack — method guards", () => {
  it("returns 204 + CORS headers on OPTIONS preflight", async () => {
    const req = new Request("https://example.com/functions/v1/track", {
      method: "OPTIONS",
    })
    const res = await handleTrack(req, { client: makeClient() })
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    expect(res.headers.get("access-control-allow-methods")).toContain("POST")
  })

  it("returns 405 on GET", async () => {
    const req = new Request("https://example.com/functions/v1/track")
    const res = await handleTrack(req, { client: makeClient() })
    expect(res.status).toBe(405)
  })
})

describe("handleTrack — payload validation", () => {
  it("returns 400 on invalid JSON", async () => {
    const req = makeReq("{not json")
    const res = await handleTrack(req, { client: makeClient() })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("bad json")
  })

  it("returns 400 on non-object payload (array)", async () => {
    const req = makeReq(["event", "page_view"])
    const res = await handleTrack(req, { client: makeClient() })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("bad payload")
  })

  it("returns 400 when event name is not in the allowlist", async () => {
    const req = makeReq({ event: "suspicious_event" })
    const res = await handleTrack(req, { client: makeClient() })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("event not allowed")
  })

  it("accepts every documented allowlisted event", async () => {
    for (const event of ALLOWED_EVENTS) {
      const client = makeClient()
      const res = await handleTrack(makeReq({ event }), { client })
      expect(res.status).toBe(204)
      expect(client.insert).toHaveBeenCalledTimes(1)
    }
  })
})

describe("handleTrack — session_hash + insert shape", () => {
  it("hashes IP+UA+YYYY-MM-DD into a deterministic session_hash", async () => {
    const client = makeClient()
    const frozen = new Date("2026-04-19T12:00:00Z")
    const req = new Request("https://example.com/functions/v1/track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.7",
        "user-agent": "Mozilla/5.0 test",
      },
      body: JSON.stringify({
        event: "page_view",
        path: "/docs",
        metadata: { ref: "twitter" },
      }),
    })
    const res = await handleTrack(req, { client, now: () => frozen })
    expect(res.status).toBe(204)
    expect(client.insert).toHaveBeenCalledTimes(1)
    const row = client.insert.mock.calls[0][0]
    expect(row.event).toBe("page_view")
    expect(row.path).toBe("/docs")
    expect(row.metadata).toEqual({ ref: "twitter" })
    const expected = await sha256Hex("203.0.113.7|Mozilla/5.0 test|2026-04-19")
    expect(row.session_hash).toBe(expected)
  })

  it("falls back to 'unknown' for IP + UA when headers are missing", async () => {
    const client = makeClient()
    const frozen = new Date("2026-04-19T00:00:00Z")
    const res = await handleTrack(makeReq({ event: "page_view" }), {
      client,
      now: () => frozen,
    })
    expect(res.status).toBe(204)
    const expected = await sha256Hex("unknown|unknown|2026-04-19")
    expect(client.insert.mock.calls[0][0].session_hash).toBe(expected)
  })

  it("uses cf-connecting-ip when x-forwarded-for is absent", async () => {
    const client = makeClient()
    const frozen = new Date("2026-04-19T00:00:00Z")
    const req = new Request("https://example.com/functions/v1/track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "198.51.100.42",
      },
      body: JSON.stringify({ event: "page_view" }),
    })
    await handleTrack(req, { client, now: () => frozen })
    const expected = await sha256Hex("198.51.100.42|unknown|2026-04-19")
    expect(client.insert.mock.calls[0][0].session_hash).toBe(expected)
  })

  it("caps oversize metadata (>2KB) to {}", async () => {
    const client = makeClient()
    const bigMetadata: Record<string, string> = {}
    for (let i = 0; i < 200; i += 1) {
      bigMetadata[`key_${i}`] = "x".repeat(20)
    }
    const res = await handleTrack(
      makeReq({ event: "page_view", metadata: bigMetadata }),
      { client },
    )
    expect(res.status).toBe(204)
    expect(client.insert.mock.calls[0][0].metadata).toEqual({})
  })

  it("drops path longer than 2048 chars", async () => {
    const client = makeClient()
    const longPath = `/${"a".repeat(2100)}`
    await handleTrack(
      makeReq({ event: "page_view", path: longPath }),
      { client },
    )
    expect(client.insert.mock.calls[0][0].path).toBeNull()
  })
})

describe("handleTrack — downstream failures", () => {
  it("returns 500 when the client is missing (misconfigured env)", async () => {
    const res = await handleTrack(makeReq({ event: "page_view" }), {
      client: null,
    })
    expect(res.status).toBe(500)
    expect(await res.text()).toBe("misconfigured")
  })

  it("returns 500 when the insert errors", async () => {
    const client = makeClient({
      insert: vi.fn().mockResolvedValue({ error: { message: "db down" } }),
    })
    const res = await handleTrack(makeReq({ event: "page_view" }), { client })
    expect(res.status).toBe(500)
    expect(await res.text()).toBe("insert failed")
  })
})
