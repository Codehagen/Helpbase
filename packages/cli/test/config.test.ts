import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

describe("lib/config", () => {
  let tmpHome: string
  let originalHome: string | undefined

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-cfg-"))
    originalHome = process.env.HOME
    process.env.HOME = tmpHome
  })

  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it("returns {} when no config file exists", async () => {
    const { readConfig } = await import("../src/lib/config.js?cfg-1")
    expect(readConfig()).toEqual({})
  })

  it("round-trips a telemetry preference", async () => {
    const mod = await import("../src/lib/config.js?cfg-2")
    mod.writeConfig({ telemetry: "on" })
    expect(mod.readConfig()).toEqual({ telemetry: "on" })
  })

  it("getOrCreateAnonId persists across reads", async () => {
    const mod = await import("../src/lib/config.js?cfg-3")
    const id1 = mod.getOrCreateAnonId()
    const id2 = mod.getOrCreateAnonId()
    expect(id1).toEqual(id2)
    expect(id1).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe("lib/telemetry", () => {
  let tmpHome: string
  let originalHome: string | undefined
  let originalEnv: string | undefined

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-tel-"))
    originalHome = process.env.HOME
    originalEnv = process.env.HELPBASE_TELEMETRY
    process.env.HOME = tmpHome
    delete process.env.HELPBASE_TELEMETRY
  })

  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome
    if (originalEnv !== undefined) process.env.HELPBASE_TELEMETRY = originalEnv
    else delete process.env.HELPBASE_TELEMETRY
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it("is disabled by default", async () => {
    const { isTelemetryEnabled } = await import("../src/lib/telemetry.js?t-1")
    expect(isTelemetryEnabled()).toBe(false)
  })

  it("is disabled when HELPBASE_TELEMETRY=off even with consent", async () => {
    const { setTelemetryConsent } = await import("../src/lib/telemetry.js?t-2")
    const { isTelemetryEnabled } = await import("../src/lib/telemetry.js?t-2b")
    setTelemetryConsent("on")
    process.env.HELPBASE_TELEMETRY = "off"
    expect(isTelemetryEnabled()).toBe(false)
  })

  it("is enabled when user opts in", async () => {
    const { setTelemetryConsent, isTelemetryEnabled } = await import(
      "../src/lib/telemetry.js?t-3"
    )
    setTelemetryConsent("on")
    expect(isTelemetryEnabled()).toBe(true)
  })

  it("hasAskedForConsent tracks whether we've prompted", async () => {
    const { hasAskedForConsent, setTelemetryConsent } = await import(
      "../src/lib/telemetry.js?t-4"
    )
    expect(hasAskedForConsent()).toBe(false)
    setTelemetryConsent("off")
    expect(hasAskedForConsent()).toBe(true)
  })
})
