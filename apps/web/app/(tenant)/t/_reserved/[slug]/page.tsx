import type { Metadata } from "next"

/**
 * Reserved-tenant landing page.
 *
 * Rendered by the subdomain middleware (proxy.ts) when a subdomain
 * matches a tenant row whose `deployed_at` is still null — meaning the
 * owner logged in and got an auto-provisioned reservation but hasn't
 * published content yet. Anyone visiting the URL sees this page instead
 * of an empty category grid, and the response carries X-Robots-Tag:
 * noindex so Google doesn't index placeholder subdomains.
 *
 * Intentionally minimal: no Supabase lookup (the middleware already
 * confirmed the slug exists), no owner email leakage, no admin info.
 * The slug in the URL is the only identifier shown.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Coming soon",
}

// Static — no per-slug data is fetched, everything the page needs lives
// in the URL segment. `revalidate` can be any value since nothing varies.
export const revalidate = 3600

export default async function ReservedTenantPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-xl flex-col items-center justify-center px-6 py-16">
      <div className="w-full text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          helpbase
        </p>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          This help center isn&apos;t live yet
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          <span className="font-mono text-foreground">{slug}.helpbase.dev</span>{" "}
          has been reserved. The owner needs to publish content before visitors
          see anything here.
        </p>

        <div className="mt-10 rounded-xl border border-border bg-muted/30 p-5 text-left">
          <p className="text-sm font-medium">If this is your help center</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Run the helpbase CLI from your project root to publish:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-background px-4 py-3 text-xs">
            <code>{`helpbase deploy`}</code>
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            Prefer a different subdomain? Run{" "}
            <code className="font-mono">helpbase rename &lt;new-slug&gt;</code>{" "}
            before your first deploy.
          </p>
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Learn more at{" "}
          <a
            href="https://helpbase.dev"
            className="underline underline-offset-4 hover:text-foreground"
          >
            helpbase.dev
          </a>
        </p>
      </div>
    </div>
  )
}
