/**
 * Pure state machine for the device-authorize UI. Extracted from
 * AuthorizeDeviceClient so the transitions can be unit-tested without
 * React, the DOM, or better-auth mocks.
 *
 *         +------------+  sessionPending=false            +------------+
 *    --> | loading    |  + session + userCode         -->| signed-in  |
 *         +------------+                                   +-----+------+
 *           |                                                    |
 *           | no session OR no userCode                          | approve
 *           v                                                    v
 *         +------------+  magic-link success          +------------+
 *         | signed-out |---------------------------->| email-sent |
 *         +------+-----+                              +------------+
 *                |
 *                | device.approve                     +------------+
 *                +--------------->| approving |--->  | approved   |
 *                                 +-----------+      +------------+
 *                |                       |
 *                | device.deny           | access_denied / throw
 *                v                       v
 *         +------------+          +------------+
 *         | denied     |          | error      |
 *         +------------+          +----+-------+
 *                                      |
 *                                      | "Try again" → SESSION_RESOLVED
 *                                      v
 *                              (back to signed-in or signed-out
 *                               depending on current session)
 */

export type Phase =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "email-sent"; email: string }
  | { kind: "signed-in"; email: string; userCode: string }
  | { kind: "approving" }
  | { kind: "approved"; email: string }
  | { kind: "denied" }
  | { kind: "error"; message: string }

/**
 * Minimal shape of what the reducer needs from Better Auth's session
 * object. Keeps the reducer decoupled from better-auth's types — tests
 * pass plain objects, no mocks.
 */
export interface SessionLike {
  user?: {
    email?: string | null
  } | null
}

export type PhaseAction =
  | { type: "SESSION_LOADING" }
  | {
      type: "SESSION_RESOLVED"
      session: SessionLike | null | undefined
      userCode: string
    }
  | { type: "MAGIC_LINK_SENT"; email: string }
  | { type: "APPROVE_STARTED" }
  | { type: "APPROVE_SUCCEEDED"; email: string }
  | { type: "DENIED" }
  | { type: "ERROR"; message: string }

// Frozen so the exported reference can't be accidentally mutated. useReducer
// passes this as the initial state without defensive copying, and any later
// `initialPhase.kind = ...` somewhere would corrupt every fresh mount.
export const initialPhase: Readonly<Phase> = Object.freeze({ kind: "loading" })

// Phases that are derived from (sessionPending, session, userCode). Only
// these respond to SESSION_* actions; in-progress and terminal phases
// (email-sent, approving, approved, denied) ignore background session
// refreshes so a Better Auth reference-churn or TTL refresh doesn't clobber
// them back to loading/signed-out mid-flow.
//
// Background: better-auth's `useSession` doesn't memoize its return value,
// so any render can re-fire the derivation effect even when data hasn't
// actually changed. Without this guard, a user watching "Check your email"
// gets bounced to the spinner or the sign-in form on a phantom refresh.
function isDerivable(kind: Phase["kind"]): boolean {
  return kind === "loading" || kind === "signed-out" || kind === "signed-in" || kind === "error"
}

export function phaseReducer(state: Phase, action: PhaseAction): Phase {
  switch (action.type) {
    case "SESSION_LOADING":
      return isDerivable(state.kind) ? { kind: "loading" } : state

    case "SESSION_RESOLVED": {
      if (!isDerivable(state.kind)) return state
      const { session, userCode } = action
      // userCode missing → we can't authorize even with a live session,
      // so send the user to the signed-out form (rare path; CLI always
      // supplies verification_uri_complete carrying user_code).
      if (!userCode) return { kind: "signed-out" }
      if (!session?.user) return { kind: "signed-out" }
      return {
        kind: "signed-in",
        // Better Auth types user.email as string | null (social providers
        // may not return one). Coalesce so the union stays string.
        email: session.user.email ?? "",
        userCode,
      }
    }

    case "MAGIC_LINK_SENT":
      return { kind: "email-sent", email: action.email }

    case "APPROVE_STARTED":
      return { kind: "approving" }

    case "APPROVE_SUCCEEDED":
      return { kind: "approved", email: action.email }

    case "DENIED":
      return { kind: "denied" }

    case "ERROR":
      return { kind: "error", message: action.message }
  }
}
