import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Pure-IO tests for the reservation cache. The module reads
 * `HELPBASE_CONFIG_DIR` at import time per-read, so tests can swap the
 * home directory per-test by setting the env var before importing.
 * Dynamic import inside each test so module-scoped state doesn't leak.
 */

let TMP_HOME: string

beforeEach(() => {
  TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-reservation-cache-"))
  process.env.HELPBASE_CONFIG_DIR = TMP_HOME
})

afterEach(() => {
  delete process.env.HELPBASE_CONFIG_DIR
  fs.rmSync(TMP_HOME, { recursive: true, force: true })
})

describe("reservation-cache", () => {
  it("returns null when no cache file exists", async () => {
    const mod = await import("../src/lib/reservation-cache.js?no-cache-1")
    expect(mod.readCachedReservation()).toBe(null)
  })

  it("write then read round-trips the reservation", async () => {
    const mod = await import("../src/lib/reservation-cache.js?no-cache-2")
    mod.writeCachedReservation({
      tenantId: "t-123",
      slug: "docs-abc123",
      liveUrl: "https://docs-abc123.helpbase.dev",
      mcpPublicToken: "mcp-token-xyz",
      userId: "u-456",
    })
    const read = mod.readCachedReservation()
    expect(read).not.toBe(null)
    expect(read?.tenantId).toBe("t-123")
    expect(read?.slug).toBe("docs-abc123")
    expect(read?.liveUrl).toBe("https://docs-abc123.helpbase.dev")
    expect(read?.userId).toBe("u-456")
    // cachedAt is stamped at write time; just verify it's an ISO string.
    expect(read?.cachedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("returns null on corrupt JSON (never throws)", async () => {
    const mod = await import("../src/lib/reservation-cache.js?no-cache-3")
    const filePath = path.join(TMP_HOME, "reservation.json")
    fs.mkdirSync(TMP_HOME, { recursive: true })
    fs.writeFileSync(filePath, "{ not valid json")
    expect(mod.readCachedReservation()).toBe(null)
  })

  it("returns null on JSON that's missing required fields", async () => {
    const mod = await import("../src/lib/reservation-cache.js?no-cache-4")
    const filePath = path.join(TMP_HOME, "reservation.json")
    fs.mkdirSync(TMP_HOME, { recursive: true })
    // Missing tenantId / userId — the shape guard in readCachedReservation
    // treats this as a corrupt cache and returns null so callers hit the
    // server on the next read.
    fs.writeFileSync(filePath, JSON.stringify({ slug: "docs-abc" }))
    expect(mod.readCachedReservation()).toBe(null)
  })

  it("clearCachedReservation removes the file and returns true only when it existed", async () => {
    const mod = await import("../src/lib/reservation-cache.js?no-cache-5")
    // No file yet: returns false.
    expect(mod.clearCachedReservation()).toBe(false)
    mod.writeCachedReservation({
      tenantId: "t-1",
      slug: "docs-1",
      liveUrl: "https://docs-1.helpbase.dev",
      mcpPublicToken: "x",
      userId: "u-1",
    })
    expect(mod.clearCachedReservation()).toBe(true)
    expect(mod.readCachedReservation()).toBe(null)
  })

  it("write overrides an existing file (user can re-login as a different account)", async () => {
    const mod = await import("../src/lib/reservation-cache.js?no-cache-6")
    mod.writeCachedReservation({
      tenantId: "t-1",
      slug: "docs-first",
      liveUrl: "https://docs-first.helpbase.dev",
      mcpPublicToken: "x",
      userId: "u-1",
    })
    mod.writeCachedReservation({
      tenantId: "t-2",
      slug: "docs-second",
      liveUrl: "https://docs-second.helpbase.dev",
      mcpPublicToken: "y",
      userId: "u-2",
    })
    const read = mod.readCachedReservation()
    expect(read?.tenantId).toBe("t-2")
    expect(read?.userId).toBe("u-2")
  })

  it("sets file mode to 0o600 so the bearer stays per-user readable", async () => {
    // chmod isn't supported on all filesystems (FAT/SMB) so this test only
    // runs on real POSIX platforms. Most developer machines + CI runners
    // qualify.
    if (process.platform === "win32") return
    const mod = await import("../src/lib/reservation-cache.js?no-cache-7")
    mod.writeCachedReservation({
      tenantId: "t-1",
      slug: "docs-perm",
      liveUrl: "https://docs-perm.helpbase.dev",
      mcpPublicToken: "x",
      userId: "u-1",
    })
    const filePath = path.join(TMP_HOME, "reservation.json")
    const stat = fs.statSync(filePath)
    // Lower 9 bits are the file permissions. 0o600 = owner rw, nobody else.
    expect(stat.mode & 0o777).toBe(0o600)
  })
})
