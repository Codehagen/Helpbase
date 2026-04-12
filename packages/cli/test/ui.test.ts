import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  note,
  ok,
  info,
  warn,
  blank,
  emit,
  emitJson,
  spinner,
  nextSteps,
  summaryTable,
  requirePrompt,
} from "../src/lib/ui.js"
import { HelpbaseError } from "../src/lib/errors.js"

const envKeys = ["CI", "HELPBASE_JSON", "HELPBASE_QUIET", "NO_COLOR", "FORCE_COLOR"] as const
type EnvSnap = Record<(typeof envKeys)[number], string | undefined>

function snapEnv(): EnvSnap {
  const s: EnvSnap = {} as EnvSnap
  for (const k of envKeys) s[k] = process.env[k]
  return s
}
function restoreEnv(s: EnvSnap) {
  for (const k of envKeys) {
    if (s[k] === undefined) delete process.env[k]
    else process.env[k] = s[k]!
  }
}
function forceTTY(s: "stdout" | "stderr" | "stdin", v: boolean) {
  Object.defineProperty(process[s], "isTTY", { value: v, configurable: true, writable: true })
}

describe("lib/ui", () => {
  let envSnap: EnvSnap
  let stdoutOriginal: boolean | undefined
  let stderrOriginal: boolean | undefined
  let stdinOriginal: boolean | undefined
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let stdoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    envSnap = snapEnv()
    for (const k of envKeys) delete process.env[k]
    stdoutOriginal = process.stdout.isTTY
    stderrOriginal = process.stderr.isTTY
    stdinOriginal = process.stdin.isTTY
    forceTTY("stdout", true)
    forceTTY("stderr", true)
    forceTTY("stdin", true)
    // NO_COLOR so snapshots don't depend on picocolors auto-detection.
    process.env.NO_COLOR = "1"
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    stdoutSpy.mockRestore()
    restoreEnv(envSnap)
    forceTTY("stdout", stdoutOriginal as boolean)
    forceTTY("stderr", stderrOriginal as boolean)
    forceTTY("stdin", stdinOriginal as boolean)
  })

  const stderrContent = () =>
    stderrSpy.mock.calls.map(([c]) => (typeof c === "string" ? c : c?.toString())).join("")
  const stdoutContent = () =>
    stdoutSpy.mock.calls.map(([c]) => (typeof c === "string" ? c : c?.toString())).join("")

  describe("stderr writers", () => {
    it("note writes to stderr when decorating is allowed", () => {
      note("hello")
      expect(stderrContent()).toContain("hello")
      expect(stdoutContent()).toBe("")
    })

    it("note is silent in --json", () => {
      process.env.HELPBASE_JSON = "1"
      note("hello")
      expect(stderrContent()).toBe("")
    })

    it("note is silent in --quiet", () => {
      process.env.HELPBASE_QUIET = "1"
      note("hello")
      expect(stderrContent()).toBe("")
    })

    it("note is silent in CI", () => {
      process.env.CI = "1"
      note("hello")
      expect(stderrContent()).toBe("")
    })

    it("ok/info/blank honor gate", () => {
      process.env.CI = "1"
      ok("ok")
      info("info")
      blank()
      expect(stderrContent()).toBe("")
    })

    it("warn is visible even in CI", () => {
      process.env.CI = "1"
      warn("heads up")
      expect(stderrContent()).toContain("heads up")
    })

    it("warn is silent in --quiet / --json", () => {
      process.env.HELPBASE_QUIET = "1"
      warn("nope")
      expect(stderrContent()).toBe("")
      process.env.HELPBASE_QUIET = undefined as unknown as string
      delete process.env.HELPBASE_QUIET
      process.env.HELPBASE_JSON = "1"
      warn("nope")
      expect(stderrContent()).toBe("")
    })
  })

  describe("stdout writers", () => {
    it("emit writes to stdout unconditionally", () => {
      process.env.HELPBASE_QUIET = "1"
      emit("composable")
      expect(stdoutContent()).toBe("composable\n")
    })

    it("emitJson writes newline-delimited JSON to stdout", () => {
      emitJson({ ok: true, n: 1 })
      expect(stdoutContent()).toBe('{"ok":true,"n":1}\n')
    })
  })

  describe("spinner fallback", () => {
    it("falls back to info lines on stderr in CI", () => {
      process.env.CI = "1"
      const s = spinner()
      s.start("working")
      s.message("still working")
      s.stop("done")
      const out = stderrContent()
      expect(out).toContain("working")
      expect(out).toContain("still working")
      expect(out).toContain("done")
      expect(out).not.toContain("\x1b[") // no ANSI escapes
    })

    it("fallback deduplicates repeated messages", () => {
      process.env.CI = "1"
      const s = spinner()
      s.start("same")
      s.message("same")
      s.message("same")
      // Each unique message appears once; duplicates suppressed.
      const occurrences = stderrContent().match(/same/g)?.length ?? 0
      expect(occurrences).toBe(1)
    })

    it("fallback error stop uses ✖ prefix", () => {
      process.env.CI = "1"
      const s = spinner()
      s.stop("boom", 1)
      expect(stderrContent()).toContain("boom")
    })
  })

  describe("nextSteps", () => {
    it("writes to stderr when decorating", () => {
      nextSteps({ commands: ["helpbase dev", "helpbase deploy"] })
      expect(stderrContent()).toContain("helpbase dev")
      expect(stderrContent()).toContain("helpbase deploy")
      expect(stdoutContent()).toBe("")
    })

    it("is silent in --json", () => {
      process.env.HELPBASE_JSON = "1"
      nextSteps({ commands: ["helpbase dev"] })
      expect(stderrContent()).toBe("")
    })

    it("is silent in CI (scripts shouldn't see epilogues)", () => {
      process.env.CI = "1"
      nextSteps({ commands: ["helpbase dev"] })
      expect(stderrContent()).toBe("")
    })

    it("renders URLs with labels", () => {
      nextSteps({ urls: [{ label: "docs:", url: "https://example.com" }] })
      expect(stderrContent()).toContain("https://example.com")
      expect(stderrContent()).toContain("docs:")
    })

    it("no-op when both lists empty", () => {
      nextSteps({})
      expect(stderrContent()).toBe("")
    })
  })

  describe("summaryTable", () => {
    it("writes aligned rows to stderr", () => {
      summaryTable([
        ["Tenant", "my-help.helpbase.dev"],
        ["Articles", "42"],
      ])
      const out = stderrContent()
      expect(out).toContain("Tenant")
      expect(out).toContain("my-help.helpbase.dev")
      expect(out).toContain("Articles")
      expect(out).toContain("42")
    })

    it("is silent in --json", () => {
      process.env.HELPBASE_JSON = "1"
      summaryTable([["a", "b"]])
      expect(stderrContent()).toBe("")
    })
  })

  describe("requirePrompt", () => {
    it("no-op when prompts are allowed", () => {
      expect(() => requirePrompt("helpbase new", ["--title"])).not.toThrow()
    })

    it("throws HelpbaseError with E_MISSING_FLAG when non-TTY", () => {
      forceTTY("stdin", false)
      try {
        requirePrompt("helpbase new", ["--title", "--type"])
        throw new Error("should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(HelpbaseError)
        const he = err as HelpbaseError
        expect(he.code).toBe("E_MISSING_FLAG")
        expect(he.fix.join(" ")).toContain("--title")
        expect(he.fix.join(" ")).toContain("--type")
      }
    })

    it("throws in --json mode even on TTY", () => {
      process.env.HELPBASE_JSON = "1"
      expect(() => requirePrompt("helpbase deploy", ["--slug"])).toThrow(HelpbaseError)
    })
  })
})
