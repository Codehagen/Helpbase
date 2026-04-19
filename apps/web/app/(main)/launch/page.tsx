import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Helpbase — docs your AI agent can actually use",
  description:
    "Helpbase turns your repo into an AI-native knowledge layer: MCP server, llms.txt, and a Next.js help center, all generated from your code. Open source. You own it.",
  openGraph: {
    title: "Helpbase — docs your AI agent can actually use",
    description:
      "Turn your repo into an AI-native knowledge layer: MCP server, llms.txt, and a Next.js help center, generated from your code.",
    url: "https://helpbase.dev/launch",
    type: "website",
  },
}

export default function LaunchPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-muted/60 via-background/80 to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,var(--muted),transparent)]" />

        <div className="relative mx-auto max-w-4xl px-6 pb-20 pt-24 text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Open source · live today
          </p>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Docs your AI agent can actually use.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
            Helpbase turns your repo into an AI-native knowledge layer. One
            command gives you an MCP server, an{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base">
              llms.txt
            </code>
            , and a Next.js help center, all generated from your code. You own
            every file.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CommandBox command="pnpm dlx create-helpbase" />
            <Link
              href="https://demo.helpbase.dev"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted"
            >
              See the live demo
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            Free tier ships with 500k AI tokens/day · No card.
          </p>
        </div>
      </section>

      {/* Why it exists */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Docs are the bottleneck for AI.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Your help center was written for humans skimming a sidebar. Agents
            need citations, structure, and a server they can call. We ship all
            three from one repo.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Pillar
            title="Code-grounded"
            body="Helpbase reads your codebase and writes MDX with citations back to the files that justify each claim. No hallucinated APIs."
          />
          <Pillar
            title="Agent-native"
            body="Every project ships an MCP server and llms.txt at build time. Claude, Cursor, and ChatGPT see the same source of truth."
          />
          <Pillar
            title="You own it"
            body="Open source, MIT. Components are shadcn/ui blocks dropped into your Next.js app. No vendor, no lock-in, no per-seat pricing."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/50 bg-muted/20">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              From repo to live docs in 90 seconds.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              One CLI. Three commands. No infrastructure to set up.
            </p>
          </div>

          <ol className="space-y-4">
            <Step
              n={1}
              command="pnpm dlx create-helpbase"
              text="Scaffolds a Next.js + shadcn/ui help center, claims a free docs-<hex>.helpbase.dev subdomain, wires MCP."
            />
            <Step
              n={2}
              command="npx helpbase ingest ."
              text="Walks your repo, synthesizes cited articles with Claude or your own key, validates every citation against source."
            />
            <Step
              n={3}
              command="npx helpbase deploy"
              text="Pushes to your subdomain. Your help center is live, your MCP server is callable, your llms.txt is fresh."
            />
          </ol>
        </div>
      </section>

      {/* Backed by */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <p className="text-sm uppercase tracking-wider text-muted-foreground">
            Built on
          </p>
          <p className="mt-3 text-lg">
            <Link
              href="https://ui.shadcn.com"
              className="font-medium underline-offset-4 hover:underline"
            >
              shadcn/ui
            </Link>{" "}
            ·{" "}
            <Link
              href="https://nextjs.org"
              className="font-medium underline-offset-4 hover:underline"
            >
              Next.js
            </Link>{" "}
            ·{" "}
            <Link
              href="https://modelcontextprotocol.io"
              className="font-medium underline-offset-4 hover:underline"
            >
              Model Context Protocol
            </Link>
          </p>
          <p className="mx-auto mt-6 max-w-xl text-sm text-muted-foreground">
            Every scaffolded project is a real shadcn project. Run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              helpbase add card
            </code>{" "}
            to extend it with anything in the shadcn registry.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/50 bg-muted/20">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ship your help center this afternoon.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Open the terminal. Paste one command. Be live before your coffee
            cools.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CommandBox command="pnpm dlx create-helpbase" />
            <Link
              href="https://github.com/Codehagen/helpbase"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <GitHubIcon className="size-4" />
              Star on GitHub
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  )
}

function Step({
  n,
  command,
  text,
}: {
  n: number
  command: string
  text: string
}) {
  return (
    <li className="flex gap-4 rounded-xl border border-border bg-background p-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
        {n}
      </span>
      <div className="flex-1 space-y-2">
        <code className="block font-mono text-sm">{command}</code>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </li>
  )
}

function CommandBox({ command }: { command: string }) {
  return (
    <div className="inline-flex h-11 items-center gap-3 rounded-lg border border-border bg-foreground px-4 font-mono text-sm text-background">
      <span className="text-muted-foreground/60">$</span>
      <span>{command}</span>
    </div>
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

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}
