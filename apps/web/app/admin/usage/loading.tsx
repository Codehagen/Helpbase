export default function Loading() {
  return <UsageCardSkeleton />
}

export function UsageCardSkeleton() {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />

      <dl className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <div className="h-3 w-12 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
        <div>
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
      </dl>

      <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-muted" />
      <div className="mt-3 h-3 w-48 animate-pulse rounded bg-muted" />
    </section>
  )
}
