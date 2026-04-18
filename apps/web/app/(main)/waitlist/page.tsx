import type { Metadata } from "next"
import { joinWaitlist } from "@/lib/waitlist"

export const metadata: Metadata = {
  title: "Join the paid-tier waitlist — helpbase",
  description:
    "helpbase is free to use (500k tokens/day). Paid tier with higher limits is coming. Drop your email to get notified when it ships.",
}

export default function WaitlistPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; from?: string }>
}) {
  return <WaitlistContent searchParamsP={searchParams} />
}

/** Mirrors lib/waitlist.ts — same regex, same fallback. */
const SAFE_SOURCE_RE = /^[a-z0-9_-]{1,40}$/

async function WaitlistContent({
  searchParamsP,
}: {
  searchParamsP?: Promise<{ status?: string; from?: string }>
}) {
  const sp = (await searchParamsP) ?? {}
  const status = sp.status
  const rawFrom = sp.from ?? "waitlist"
  const from = SAFE_SOURCE_RE.test(rawFrom) ? rawFrom : "waitlist"

  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        paid tier (coming soon)
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Join the waitlist</h1>
      <p className="mt-4 text-muted-foreground">
        helpbase is free to use — 500,000 tokens per day is enough for most teams. A paid tier
        with higher limits, priority support, and team accounts is on the way. Drop your email
        and we&rsquo;ll let you know when it ships.
      </p>

      <p className="mt-2 text-sm text-muted-foreground">
        Need more tokens right now?{" "}
        <a href="/guides/byok" className="underline hover:text-foreground">
          Bring your own key (Anthropic, OpenAI, or Gateway)
        </a>{" "}
        — unlimited, your own cost.
      </p>

      {status === "ok" ? (
        <div className="mt-8 rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm">
          Thanks — you&rsquo;re on the list. We&rsquo;ll email you when the paid tier ships.
        </div>
      ) : status === "error" ? (
        <div className="mt-8 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          Something went wrong. Try again, or email hi@helpbase.dev.
        </div>
      ) : null}

      <form action={joinWaitlist} className="mt-8 flex gap-3">
        <input type="hidden" name="source" value={from} />
        <input
          type="email"
          name="email"
          required
          placeholder="you@company.com"
          className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Join
        </button>
      </form>

      <p className="mt-6 text-xs text-muted-foreground">
        No spam. We&rsquo;ll email once when the paid tier opens. Unsubscribe any time.
      </p>
    </main>
  )
}
