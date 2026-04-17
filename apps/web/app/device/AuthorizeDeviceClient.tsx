"use client"

import { useEffect, useState, type FormEvent } from "react"
import { createAuthClient } from "better-auth/react"
import { magicLinkClient, deviceAuthorizationClient } from "better-auth/client/plugins"

// Inline the auth client here (one consumer, one module) to side-step
// TS's "inferred type cannot be named" portability complaint on the
// deeply-nested better-auth types. If a second component needs the
// client later, promote this to lib/auth-client.ts with an explicit
// return-type annotation.
const authClient = createAuthClient({
  plugins: [magicLinkClient(), deviceAuthorizationClient()],
})

type Phase =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "email-sent"; email: string }
  | { kind: "signed-in"; email: string; userCode: string }
  | { kind: "approving" }
  | { kind: "approved"; email: string }
  | { kind: "denied" }
  | { kind: "error"; message: string }

export function AuthorizeDeviceClient({ initialUserCode }: { initialUserCode: string }) {
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const [userCode, setUserCode] = useState(initialUserCode)
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Derive the UI phase from session state + URL-provided user_code.
  useEffect(() => {
    if (sessionPending) {
      setPhase({ kind: "loading" })
      return
    }
    if (!userCode) {
      // No user_code on the URL — show an input. Rare path; the CLI
      // always provides verification_uri_complete which carries it.
      setPhase({ kind: "signed-out" })
      return
    }
    if (!session?.user) {
      setPhase({ kind: "signed-out" })
      return
    }
    setPhase({
      kind: "signed-in",
      email: session.user.email,
      userCode,
    })
  }, [sessionPending, session, userCode])

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) return
    setSubmitting(true)
    try {
      const callback = userCode
        ? `/device?user_code=${encodeURIComponent(userCode)}`
        : "/device"
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: callback,
      })
      if (error) {
        setPhase({
          kind: "error",
          message: error.message ?? "Couldn't send sign-in email.",
        })
      } else {
        setPhase({ kind: "email-sent", email })
      }
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprove() {
    setPhase({ kind: "approving" })
    try {
      const { error } = await authClient.device.approve({ userCode })
      if (error) {
        // device.approve returns RFC-8628-shaped error codes
        // ("access_denied", "expired_token", etc.) rather than a plain
        // message field. error_description is the human-readable text.
        setPhase({
          kind: "error",
          message: error.error_description ?? "Authorization failed.",
        })
        return
      }
      setPhase({
        kind: "approved",
        email: session?.user?.email ?? "",
      })
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleDeny() {
    try {
      await authClient.device.deny({ userCode })
    } catch {
      // best-effort — regardless, we show the denied screen
    }
    setPhase({ kind: "denied" })
  }

  if (phase.kind === "loading") {
    return <div className="text-center text-sm text-neutral-500">Checking session…</div>
  }

  if (phase.kind === "signed-out") {
    return (
      <form onSubmit={handleMagicLink} className="space-y-4">
        {userCode && (
          <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-center text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
            <div className="uppercase tracking-wider text-neutral-500">
              Device code
            </div>
            <div className="mt-1 font-mono text-base text-neutral-900 dark:text-neutral-100">
              {userCode}
            </div>
          </div>
        )}
        <label className="block text-sm font-medium">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {submitting ? "Sending…" : "Send sign-in link"}
        </button>
        <p className="text-center text-xs text-neutral-500">
          Don't have an account? Signing in with a new email creates one
          automatically.
        </p>
      </form>
    )
  }

  if (phase.kind === "email-sent") {
    return (
      <div className="space-y-3 text-center">
        <div className="text-4xl">📬</div>
        <p className="text-sm">
          Check <span className="font-medium">{phase.email}</span> for your
          sign-in link. After clicking, you'll land back here to authorize.
        </p>
      </div>
    )
  }

  if (phase.kind === "signed-in" || phase.kind === "approving") {
    const approving = phase.kind === "approving"
    return (
      <div className="space-y-4">
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-center dark:border-neutral-800 dark:bg-neutral-950">
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            Device code
          </div>
          <div className="mt-1 font-mono text-lg text-neutral-900 dark:text-neutral-100">
            {userCode}
          </div>
        </div>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Signed in as{" "}
          <span className="font-medium">
            {phase.kind === "signed-in" ? phase.email : session?.user?.email}
          </span>
          . Authorizing will give the CLI full access to the helpbase API on
          your behalf.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {approving ? "Authorizing…" : "Authorize"}
          </button>
          <button
            type="button"
            onClick={handleDeny}
            disabled={approving}
            className="flex-1 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (phase.kind === "approved") {
    return (
      <div className="space-y-3 text-center">
        <div className="text-4xl">✓</div>
        <p className="text-sm font-medium">
          Authorized. Return to your terminal.
        </p>
        <p className="text-xs text-neutral-500">
          Your CLI will pick this up in a few seconds. You can close this
          tab.
        </p>
      </div>
    )
  }

  if (phase.kind === "denied") {
    return (
      <div className="space-y-3 text-center">
        <div className="text-4xl">✕</div>
        <p className="text-sm">Cancelled. Your CLI session was not signed in.</p>
      </div>
    )
  }

  // phase.kind === "error"
  return (
    <div className="space-y-3 text-center">
      <div className="text-4xl">⚠️</div>
      <p className="text-sm text-red-600 dark:text-red-400">{phase.message}</p>
      <button
        type="button"
        onClick={() => setPhase({ kind: "signed-out" })}
        className="text-sm text-neutral-600 underline dark:text-neutral-400"
      >
        Try again
      </button>
    </div>
  )
}
