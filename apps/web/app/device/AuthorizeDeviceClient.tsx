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

export interface ProviderAvailability {
  google: boolean
  github: boolean
}

export function AuthorizeDeviceClient({
  initialUserCode,
  providers,
}: {
  initialUserCode: string
  providers: ProviderAvailability
}) {
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const [userCode, setUserCode] = useState(initialUserCode)
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [socialSubmitting, setSocialSubmitting] = useState<"google" | "github" | null>(null)

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
      email: session.user.email ?? "",
      userCode,
    })
  }, [sessionPending, session, userCode])

  async function handleSocialSignIn(provider: "google" | "github") {
    setSocialSubmitting(provider)
    try {
      // callbackURL preserves user_code so the OAuth round-trip lands
      // back on the same device-authorize surface. Better Auth drops the
      // rest of the query string, so anything not in callbackURL is lost.
      const callback = userCode
        ? `/device?user_code=${encodeURIComponent(userCode)}`
        : "/device"
      await authClient.signIn.social({ provider, callbackURL: callback })
      // On success, the browser is already redirecting to the OAuth
      // provider; nothing to do here. If signIn.social rejects, we fall
      // through to the catch.
    } catch (err) {
      setSocialSubmitting(null)
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

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
    const anySocial = providers.google || providers.github
    const socialBusy = socialSubmitting !== null
    return (
      <div className="space-y-4">
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
        {anySocial && (
          <div className="space-y-2">
            {providers.google && (
              <button
                type="button"
                onClick={() => handleSocialSignIn("google")}
                disabled={socialBusy || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                <GoogleIcon />
                {socialSubmitting === "google" ? "Redirecting…" : "Continue with Google"}
              </button>
            )}
            {providers.github && (
              <button
                type="button"
                onClick={() => handleSocialSignIn("github")}
                disabled={socialBusy || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                <GitHubIcon />
                {socialSubmitting === "github" ? "Redirecting…" : "Continue with GitHub"}
              </button>
            )}
            <div className="flex items-center gap-2 py-1 text-xs uppercase tracking-wider text-neutral-400">
              <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
              <span>or</span>
              <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
            </div>
          </div>
        )}
        <form onSubmit={handleMagicLink} className="space-y-4">
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
            disabled={submitting || socialBusy}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {submitting ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
        <p className="text-center text-xs text-neutral-500">
          Don't have an account? Signing in with a new {anySocial ? "provider or email" : "email"} creates one
          automatically.
        </p>
      </div>
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
        onClick={() => {
          if (session?.user && userCode) {
            setPhase({
              kind: "signed-in",
              email: session.user.email ?? "",
              userCode,
            })
          } else {
            setPhase({ kind: "signed-out" })
          }
        }}
        className="text-sm text-neutral-600 underline dark:text-neutral-400"
      >
        Try again
      </button>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707a5.41 5.41 0 0 1-.282-1.707c0-.593.102-1.17.282-1.707V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.335z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
