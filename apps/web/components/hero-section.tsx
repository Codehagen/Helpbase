import Link from "next/link"

/**
 * Marketing hero for the (main) landing page. Centered column on a
 * bordered container, soft grid background. Mirrors the existing landing
 * aesthetic (grid lines + radial wash) so it composes cleanly with the
 * categories block below.
 */
export default function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-border/50">
      {/* Background: subtle grid + radial wash */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-muted/60 via-background/80 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,var(--muted),transparent)]" />

      <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-20 text-center sm:pt-28">
        {/* Status pill */}
        <Link
          href="https://github.com/Codehagen/helpbase"
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:border-foreground/20"
        >
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Open source · Live today
          <ChevronRight className="size-3 opacity-60" />
        </Link>

        {/* Headline */}
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Docs your AI agent can actually use.
        </h1>

        {/* Subline */}
        <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
          Helpbase turns your repo into an AI-native knowledge layer. One
          command gives you an MCP server, an{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-base">
            llms.txt
          </code>
          , and a Next.js help center generated from your code. You own
          every file.
        </p>

        {/* CTAs */}
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <CommandPill command="pnpm dlx create-helpbase" />
          <Link
            href="https://demo.helpbase.dev"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted"
          >
            See the live demo
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Free tier: 500k AI tokens/day. No card.
        </p>

        {/* Built-on row */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <span className="text-xs uppercase tracking-wider">Built on</span>
          <BuiltOnLink href="https://ui.shadcn.com">shadcn/ui</BuiltOnLink>
          <BuiltOnLink href="https://nextjs.org">Next.js</BuiltOnLink>
          <BuiltOnLink href="https://modelcontextprotocol.io">
            Model Context Protocol
          </BuiltOnLink>
        </div>
      </div>
    </section>
  )
}

function CommandPill({ command }: { command: string }) {
  return (
    <div className="inline-flex h-11 items-center gap-3 rounded-lg border border-border bg-foreground px-4 font-mono text-sm text-background">
      <span className="text-background/40">$</span>
      <span>{command}</span>
    </div>
  )
}

function BuiltOnLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
    >
      {children}
    </Link>
  )
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}
