"use client"

import { useSuspenseQuery } from "@tanstack/react-query"
import { usageTodayOptions } from "@/lib/query-options"

export function UsageCard() {
  const { data } = useSuspenseQuery(usageTodayOptions())
  const { usedToday, dailyLimit, resetAt } = data.quota
  const pct = dailyLimit > 0 ? Math.min(100, Math.round((usedToday / dailyLimit) * 100)) : 0

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h1 className="text-lg font-semibold">Today&rsquo;s usage</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Signed in as <span className="font-mono">{data.email}</span>
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Used</dt>
          <dd className="mt-1 font-mono text-2xl">{usedToday.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Daily limit</dt>
          <dd className="mt-1 font-mono text-2xl">{dailyLimit.toLocaleString()}</dd>
        </div>
      </dl>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Resets at {new Date(resetAt).toLocaleString()}
      </p>
    </section>
  )
}
