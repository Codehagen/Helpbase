"use client"

// Catches errors thrown from any /admin/* route. Without this, a
// useSuspenseQuery failure (Supabase blip, 5xx) escapes to the root
// error boundary and takes the admin chrome down with it.

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-lg font-semibold text-destructive">
        Something went wrong in the admin area
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message || "Unknown error"}
      </p>
      {error.digest ? (
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          Ref: {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        Try again
      </button>
    </div>
  )
}
