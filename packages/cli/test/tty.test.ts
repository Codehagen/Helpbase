import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  isTTY,
  isStderrTTY,
  isCI,
  isJsonMode,
  isQuiet,
  syncFlags,
  canColor,
  canSpinner,
  canPrompt,
  canDecorate,
} from "../src/lib/tty.js"

const envKeys = [
  "CI",
  "HELPBASE_JSON",
  "HELPBASE_QUIET",
  "NO_COLOR",
  "FORCE_COLOR",
] as const

type EnvSnapshot = Record<(typeof envKeys)[number], string | undefined>

function snapshotEnv(): EnvSnapshot {
  const snap: EnvSnapshot = {} as EnvSnapshot
  for (const k of envKeys) snap[k] = process.env[k]
  return snap
}

function restoreEnv(snap: EnvSnapshot) {
  for (const k of envKeys) {
    if (snap[k] === undefined) delete process.env[k]
    else process.env[k] = snap[k]!
  }
}

function forceTTY(stream: "stdout" | "stderr" | "stdin", value: boolean) {
  Object.defineProperty(process[stream], "isTTY", {
    value,
    configurable: true,
    writable: true,
  })
}

describe("lib/tty", () => {
  let envSnap: EnvSnapshot
  let stdoutOriginal: boolean | undefined
  let stderrOriginal: boolean | undefined
  let stdinOriginal: boolean | undefined

  beforeEach(() => {
    envSnap = snapshotEnv()
    for (const k of envKeys) delete process.env[k]
    stdoutOriginal = process.stdout.isTTY
    stderrOriginal = process.stderr.isTTY
    stdinOriginal = process.stdin.isTTY
  })

  afterEach(() => {
    restoreEnv(envSnap)
    forceTTY("stdout", stdoutOriginal as boolean)
    forceTTY("stderr", stderrOriginal as boolean)
    forceTTY("stdin", stdinOriginal as boolean)
  })

  describe("env-truthy detection", () => {
    it("treats CI=1 as truthy", () => {
      process.env.CI = "1"
      expect(isCI()).toBe(true)
    })

    it("treats CI=0 as falsy", () => {
      process.env.CI = "0"
      expect(isCI()).toBe(false)
    })

    it("treats CI=false as falsy", () => {
      process.env.CI = "false"
      expect(isCI()).toBe(false)
    })

    it("treats empty CI as falsy", () => {
      process.env.CI = ""
      expect(isCI()).toBe(false)
    })
  })

  describe("isJsonMode / isQuiet", () => {
    it("reads HELPBASE_JSON", () => {
      process.env.HELPBASE_JSON = "1"
      expect(isJsonMode()).toBe(true)
    })

    it("reads HELPBASE_QUIET", () => {
      process.env.HELPBASE_QUIET = "1"
      expect(isQuiet()).toBe(true)
    })
  })

  describe("syncFlags", () => {
    it("sets HELPBASE_JSON when json=true", () => {
      syncFlags({ json: true })
      expect(process.env.HELPBASE_JSON).toBe("1")
    })

    it("sets HELPBASE_QUIET when quiet=true", () => {
      syncFlags({ quiet: true })
      expect(process.env.HELPBASE_QUIET).toBe("1")
    })

    it("leaves env alone when flags are false", () => {
      syncFlags({ json: false, quiet: false })
      expect(process.env.HELPBASE_JSON).toBeUndefined()
      expect(process.env.HELPBASE_QUIET).toBeUndefined()
    })
  })

  describe("isTTY", () => {
    it("reflects process.stdout.isTTY truthy", () => {
      forceTTY("stdout", true)
      expect(isTTY()).toBe(true)
    })

    it("reflects process.stdout.isTTY falsy", () => {
      forceTTY("stdout", false)
      expect(isTTY()).toBe(false)
    })

    it("isStderrTTY reflects stderr independently", () => {
      forceTTY("stdout", false)
      forceTTY("stderr", true)
      expect(isTTY()).toBe(false)
      expect(isStderrTTY()).toBe(true)
    })
  })

  describe("canColor", () => {
    it("returns false when NO_COLOR is set", () => {
      process.env.NO_COLOR = "1"
      forceTTY("stderr", true)
      expect(canColor()).toBe(false)
    })

    it("returns true when FORCE_COLOR is set even in CI", () => {
      process.env.FORCE_COLOR = "1"
      process.env.CI = "1"
      forceTTY("stderr", false)
      expect(canColor()).toBe(true)
    })

    it("returns false in CI by default", () => {
      process.env.CI = "1"
      forceTTY("stderr", true)
      expect(canColor()).toBe(false)
    })

    it("returns false when stderr is not a TTY", () => {
      forceTTY("stderr", false)
      expect(canColor()).toBe(false)
    })

    it("returns true when stderr is a TTY and no overrides apply", () => {
      forceTTY("stderr", true)
      expect(canColor()).toBe(true)
    })
  })

  describe("canSpinner", () => {
    it("false in --json", () => {
      process.env.HELPBASE_JSON = "1"
      forceTTY("stderr", true)
      expect(canSpinner()).toBe(false)
    })

    it("false in --quiet", () => {
      process.env.HELPBASE_QUIET = "1"
      forceTTY("stderr", true)
      expect(canSpinner()).toBe(false)
    })

    it("false in CI", () => {
      process.env.CI = "1"
      forceTTY("stderr", true)
      expect(canSpinner()).toBe(false)
    })

    it("false when stderr is not a TTY", () => {
      forceTTY("stderr", false)
      expect(canSpinner()).toBe(false)
    })

    it("true on stderr TTY without overrides", () => {
      forceTTY("stderr", true)
      expect(canSpinner()).toBe(true)
    })
  })

  describe("canPrompt", () => {
    it("requires stdin TTY", () => {
      forceTTY("stdin", false)
      forceTTY("stderr", true)
      expect(canPrompt()).toBe(false)
    })

    it("false in --json", () => {
      process.env.HELPBASE_JSON = "1"
      forceTTY("stdin", true)
      forceTTY("stderr", true)
      expect(canPrompt()).toBe(false)
    })

    it("false in CI", () => {
      process.env.CI = "1"
      forceTTY("stdin", true)
      forceTTY("stderr", true)
      expect(canPrompt()).toBe(false)
    })

    it("true when stdin + stderr are TTYs without overrides", () => {
      forceTTY("stdin", true)
      forceTTY("stderr", true)
      expect(canPrompt()).toBe(true)
    })
  })

  describe("canDecorate", () => {
    it("false in --json", () => {
      process.env.HELPBASE_JSON = "1"
      forceTTY("stdout", true)
      forceTTY("stderr", true)
      expect(canDecorate()).toBe(false)
    })

    it("false in --quiet", () => {
      process.env.HELPBASE_QUIET = "1"
      forceTTY("stdout", true)
      forceTTY("stderr", true)
      expect(canDecorate()).toBe(false)
    })

    it("false in CI", () => {
      process.env.CI = "1"
      forceTTY("stdout", true)
      forceTTY("stderr", true)
      expect(canDecorate()).toBe(false)
    })

    it("false when stderr is not a TTY", () => {
      forceTTY("stdout", true)
      forceTTY("stderr", false)
      expect(canDecorate()).toBe(false)
    })

    it("false when stdout is piped (composition mode)", () => {
      forceTTY("stdout", false)
      forceTTY("stderr", true)
      expect(canDecorate()).toBe(false)
    })

    it("true when both streams are TTYs and no overrides", () => {
      forceTTY("stdout", true)
      forceTTY("stderr", true)
      expect(canDecorate()).toBe(true)
    })
  })
})
