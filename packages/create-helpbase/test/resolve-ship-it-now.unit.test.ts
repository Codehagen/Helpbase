import { describe, it, expect, vi } from "vitest"
import { resolveShipItNow, ShipItNowRefusedError } from "../src/ship-it-now.js"

// Stub matching clack's confirm() return. Never called when the
// precedence rules above the prompt short-circuit the decision.
const fakeConfirm = (answer: boolean | symbol) => {
  return vi.fn(async () => answer) as any
}

describe("resolveShipItNow — flag precedence", () => {
  it("returns true when --deploy is passed with real content (url)", async () => {
    const prompt = fakeConfirm(false)
    const got = await resolveShipItNow({
      flagDeploy: true,
      sourceKind: "url",
      isInteractive: false,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(true)
    expect(prompt).not.toHaveBeenCalled()
  })

  it("returns true when --deploy is passed with a repo source", async () => {
    const prompt = fakeConfirm(false)
    const got = await resolveShipItNow({
      flagDeploy: true,
      sourceKind: "repo",
      isInteractive: true,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(true)
    expect(prompt).not.toHaveBeenCalled()
  })

  it("returns false when --no-deploy is passed (overrides everything)", async () => {
    const prompt = fakeConfirm(true)
    const got = await resolveShipItNow({
      flagDeploy: false,
      sourceKind: "url",
      isInteractive: true,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
  })
})

describe("resolveShipItNow — --deploy + --source skip footgun", () => {
  it("throws ShipItNowRefusedError in non-interactive mode", async () => {
    const prompt = fakeConfirm(true)
    await expect(
      resolveShipItNow({
        flagDeploy: true,
        sourceKind: "skip",
        isInteractive: false,
        generationSucceeded: true,
        promptFn: prompt,
      }),
    ).rejects.toBeInstanceOf(ShipItNowRefusedError)
    expect(prompt).not.toHaveBeenCalled()
  })

  it("refused error message mentions both flags so user knows how to fix", async () => {
    try {
      await resolveShipItNow({
        flagDeploy: true,
        sourceKind: "skip",
        isInteractive: false,
        generationSucceeded: true,
      })
      expect.fail("expected throw")
    } catch (err) {
      expect(err).toBeInstanceOf(ShipItNowRefusedError)
      expect((err as Error).message).toContain("--deploy")
      expect((err as Error).message).toContain("--source")
    }
  })

  it("interactive mode re-prompts with N-default, returns true on explicit Y", async () => {
    const prompt = fakeConfirm(true)
    const got = await resolveShipItNow({
      flagDeploy: true,
      sourceKind: "skip",
      isInteractive: true,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(true)
    expect(prompt).toHaveBeenCalledOnce()
    // Footgun-confirm should default to false (N).
    const call = prompt.mock.calls[0][0] as { initialValue: boolean }
    expect(call.initialValue).toBe(false)
  })

  it("interactive mode returns false when user declines sample-content publish", async () => {
    const prompt = fakeConfirm(false)
    const got = await resolveShipItNow({
      flagDeploy: true,
      sourceKind: "skip",
      isInteractive: true,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(false)
    expect(prompt).toHaveBeenCalledOnce()
  })
})

describe("resolveShipItNow — --deploy + generation-failed footgun", () => {
  it("throws ShipItNowRefusedError in non-interactive mode", async () => {
    const prompt = fakeConfirm(true)
    await expect(
      resolveShipItNow({
        flagDeploy: true,
        sourceKind: "url",
        isInteractive: false,
        generationSucceeded: false,
        promptFn: prompt,
      }),
    ).rejects.toBeInstanceOf(ShipItNowRefusedError)
    expect(prompt).not.toHaveBeenCalled()
  })

  it("error message mentions generation failure + --deploy", async () => {
    try {
      await resolveShipItNow({
        flagDeploy: true,
        sourceKind: "repo",
        isInteractive: false,
        generationSucceeded: false,
      })
      expect.fail("expected throw")
    } catch (err) {
      expect(err).toBeInstanceOf(ShipItNowRefusedError)
      expect((err as Error).message).toMatch(/generation/i)
      expect((err as Error).message).toContain("--deploy")
    }
  })

  it("interactive mode re-prompts with N-default", async () => {
    const prompt = fakeConfirm(false)
    const got = await resolveShipItNow({
      flagDeploy: true,
      sourceKind: "url",
      isInteractive: true,
      generationSucceeded: false,
      promptFn: prompt,
    })
    expect(got).toBe(false)
    expect(prompt).toHaveBeenCalledOnce()
    const call = prompt.mock.calls[0][0] as { initialValue: boolean }
    expect(call.initialValue).toBe(false)
  })
})

describe("resolveShipItNow — implicit skip paths", () => {
  it("returns false when source === 'skip' (sample content)", async () => {
    const prompt = fakeConfirm(true)
    const got = await resolveShipItNow({
      flagDeploy: undefined,
      sourceKind: "skip",
      isInteractive: true,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
  })

  it("returns false in non-interactive mode (no flag, no TTY)", async () => {
    const prompt = fakeConfirm(true)
    const got = await resolveShipItNow({
      flagDeploy: undefined,
      sourceKind: "url",
      isInteractive: false,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
  })

  it("returns false when AI generation failed (sample content remains)", async () => {
    const prompt = fakeConfirm(true)
    const got = await resolveShipItNow({
      flagDeploy: undefined,
      sourceKind: "url",
      isInteractive: true,
      generationSucceeded: false,
      promptFn: prompt,
    })
    expect(got).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
  })
})

describe("resolveShipItNow — interactive prompt", () => {
  it("prompts and returns true when user confirms", async () => {
    const prompt = fakeConfirm(true)
    const got = await resolveShipItNow({
      flagDeploy: undefined,
      sourceKind: "url",
      isInteractive: true,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(true)
    expect(prompt).toHaveBeenCalledOnce()
  })

  it("prompts and returns false when user declines", async () => {
    const prompt = fakeConfirm(false)
    const got = await resolveShipItNow({
      flagDeploy: undefined,
      sourceKind: "repo",
      isInteractive: true,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(false)
    expect(prompt).toHaveBeenCalledOnce()
  })

  it("returns false when user cancels the prompt (Ctrl-C)", async () => {
    const cancelSymbol = Symbol.for("clack:cancel")
    const prompt = fakeConfirm(cancelSymbol)
    const got = await resolveShipItNow({
      flagDeploy: undefined,
      sourceKind: "url",
      isInteractive: true,
      generationSucceeded: true,
      promptFn: prompt,
    })
    expect(got).toBe(false)
  })
})
