import { describe, expect, it } from "vitest"
import {
  initialPhase,
  phaseReducer,
  type Phase,
  type PhaseAction,
} from "./phase-reducer"

/**
 * Pure transition tests. No React, no DOM, no mocks. Every branch of
 * `phaseReducer` is exercised against every meaningful starting phase.
 * If a new action is added the switch's exhaustiveness check will
 * break this file — add the transition test there, too.
 */

const SAMPLE: Phase[] = [
  { kind: "loading" },
  { kind: "signed-out" },
  { kind: "email-sent", email: "prev@example.com" },
  { kind: "signed-in", email: "prev@example.com", userCode: "PREV-CODE" },
  { kind: "approving" },
  { kind: "approved", email: "prev@example.com" },
  { kind: "denied" },
  { kind: "error", message: "prev" },
]

describe("initialPhase", () => {
  it("starts in loading", () => {
    expect(initialPhase).toEqual({ kind: "loading" })
  })
})

describe("phaseReducer — SESSION_LOADING", () => {
  it("returns loading regardless of prior phase", () => {
    for (const prior of SAMPLE) {
      expect(phaseReducer(prior, { type: "SESSION_LOADING" })).toEqual({
        kind: "loading",
      })
    }
  })
})

describe("phaseReducer — SESSION_RESOLVED", () => {
  const baseAction = (
    overrides: Partial<Extract<PhaseAction, { type: "SESSION_RESOLVED" }>> = {},
  ) =>
    ({
      type: "SESSION_RESOLVED",
      session: null,
      userCode: "",
      ...overrides,
    }) satisfies Extract<PhaseAction, { type: "SESSION_RESOLVED" }>

  it("falls to signed-out when userCode is empty (session present)", () => {
    const result = phaseReducer(
      initialPhase,
      baseAction({ session: { user: { email: "x@y.com" } }, userCode: "" }),
    )
    expect(result).toEqual({ kind: "signed-out" })
  })

  it("falls to signed-out when userCode is empty (session absent)", () => {
    const result = phaseReducer(
      initialPhase,
      baseAction({ session: null, userCode: "" }),
    )
    expect(result).toEqual({ kind: "signed-out" })
  })

  it("falls to signed-out when session is null", () => {
    const result = phaseReducer(
      initialPhase,
      baseAction({ session: null, userCode: "ABCD-EFGH" }),
    )
    expect(result).toEqual({ kind: "signed-out" })
  })

  it("falls to signed-out when session is undefined", () => {
    const result = phaseReducer(
      initialPhase,
      baseAction({ session: undefined, userCode: "ABCD-EFGH" }),
    )
    expect(result).toEqual({ kind: "signed-out" })
  })

  it("falls to signed-out when session.user is null", () => {
    const result = phaseReducer(
      initialPhase,
      baseAction({ session: { user: null }, userCode: "ABCD-EFGH" }),
    )
    expect(result).toEqual({ kind: "signed-out" })
  })

  it("transitions to signed-in with email when session + userCode are present", () => {
    const result = phaseReducer(
      initialPhase,
      baseAction({
        session: { user: { email: "x@y.com" } },
        userCode: "ABCD-EFGH",
      }),
    )
    expect(result).toEqual({
      kind: "signed-in",
      email: "x@y.com",
      userCode: "ABCD-EFGH",
    })
  })

  // REGRESSION: Better Auth types user.email as string | null (social
  // providers without email scope return null). The old code read
  // session.user.email directly, which broke the Phase union's
  // `email: string` invariant when true.
  it("coalesces null email to empty string (regression: better-auth string|null)", () => {
    const result = phaseReducer(
      initialPhase,
      baseAction({
        session: { user: { email: null } },
        userCode: "ABCD-EFGH",
      }),
    )
    expect(result).toEqual({
      kind: "signed-in",
      email: "",
      userCode: "ABCD-EFGH",
    })
  })

  it("coalesces undefined email to empty string", () => {
    const result = phaseReducer(
      initialPhase,
      baseAction({
        session: { user: {} },
        userCode: "ABCD-EFGH",
      }),
    )
    expect(result).toEqual({
      kind: "signed-in",
      email: "",
      userCode: "ABCD-EFGH",
    })
  })

  // This is also the retry path — clicking "Try again" dispatches
  // SESSION_RESOLVED with the current session + userCode. From the
  // `error` state, a valid session should route back to signed-in.
  it("routes from error → signed-in when session + userCode are valid (retry)", () => {
    const result = phaseReducer(
      { kind: "error", message: "approval failed" },
      baseAction({
        session: { user: { email: "x@y.com" } },
        userCode: "ABCD-EFGH",
      }),
    )
    expect(result).toEqual({
      kind: "signed-in",
      email: "x@y.com",
      userCode: "ABCD-EFGH",
    })
  })

  it("routes from error → signed-out when session is absent (retry)", () => {
    const result = phaseReducer(
      { kind: "error", message: "boom" },
      baseAction({ session: null, userCode: "ABCD-EFGH" }),
    )
    expect(result).toEqual({ kind: "signed-out" })
  })
})

describe("phaseReducer — MAGIC_LINK_SENT", () => {
  it("transitions to email-sent with email", () => {
    const result = phaseReducer(
      { kind: "signed-out" },
      { type: "MAGIC_LINK_SENT", email: "x@y.com" },
    )
    expect(result).toEqual({ kind: "email-sent", email: "x@y.com" })
  })
})

describe("phaseReducer — APPROVE_STARTED", () => {
  it("transitions signed-in → approving", () => {
    const result = phaseReducer(
      { kind: "signed-in", email: "x@y.com", userCode: "CODE" },
      { type: "APPROVE_STARTED" },
    )
    expect(result).toEqual({ kind: "approving" })
  })
})

describe("phaseReducer — APPROVE_SUCCEEDED", () => {
  it("transitions approving → approved with email", () => {
    const result = phaseReducer(
      { kind: "approving" },
      { type: "APPROVE_SUCCEEDED", email: "x@y.com" },
    )
    expect(result).toEqual({ kind: "approved", email: "x@y.com" })
  })

  it("accepts empty email (caller coalesces null at the dispatch site)", () => {
    const result = phaseReducer(
      { kind: "approving" },
      { type: "APPROVE_SUCCEEDED", email: "" },
    )
    expect(result).toEqual({ kind: "approved", email: "" })
  })
})

describe("phaseReducer — DENIED", () => {
  it("transitions signed-in → denied", () => {
    const result = phaseReducer(
      { kind: "signed-in", email: "x@y.com", userCode: "CODE" },
      { type: "DENIED" },
    )
    expect(result).toEqual({ kind: "denied" })
  })

  it("transitions approving → denied (user cancelled mid-flight)", () => {
    const result = phaseReducer({ kind: "approving" }, { type: "DENIED" })
    expect(result).toEqual({ kind: "denied" })
  })
})

describe("phaseReducer — ERROR", () => {
  it("transitions to error with message", () => {
    const result = phaseReducer(
      { kind: "approving" },
      { type: "ERROR", message: "network failed" },
    )
    expect(result).toEqual({ kind: "error", message: "network failed" })
  })

  it("is dispatchable from any phase (global failure catch)", () => {
    for (const prior of SAMPLE) {
      expect(
        phaseReducer(prior, { type: "ERROR", message: "boom" }),
      ).toEqual({ kind: "error", message: "boom" })
    }
  })
})
