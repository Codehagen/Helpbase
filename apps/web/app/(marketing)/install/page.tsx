import type { Metadata } from "next"
import Link from "next/link"

import { Header } from "@/components/header"
import FooterSection from "@/components/footer"
import { InstallCommand } from "./install-command"

export const metadata: Metadata = {
  title: "Install — Helpbase",
  description:
    "Install helpbase in one command, or compose the pieces. shadcn-native primitives for docs routes, MCP server, and citation-grounded CI sync.",
}

/**
 * /install — the catalog page for shadcn-native install options.
 *
 * The homepage CTA (`pnpm dlx helpbase init`) lands everything at once.
 * This page is for developers who want to compose piece-by-piece:
 *
 *   - Everything (recommended)    — the all-in-one drop
 *   - Help center only             — routes + MDX pipeline + starter content
 *   - CI workflow only             — for repos that already have docs
 *   - MCP server only              — for projects that already have docs + don't need CI
 *   - Greenfield                   — scaffold a fresh Next.js app
 *   - Standalone components        — sidebar, search, TOC as registry components
 *
 * Every entry shows: what it lands, when to use it, the exact copy-paste
 * command, and a link to the raw registry JSON (for transparency + audit).
 */

interface InstallOption {
  id: string
  title: string
  description: string
  whenToUse: string
  command: string
  registryUrl?: string
  tag?: "recommended" | "greenfield" | "component"
}

const PRIMARY: InstallOption[] = [
  {
    id: "helpbase",
    title: "Everything",
    description:
      "The full helpbase primitive in one command. Drops docs routes, starter MDX, the MCP server, and the citation-grounded sync workflow. Zero-config auth via GitHub OIDC.",
    whenToUse:
      "You have an existing Next.js app and want helpbase working end-to-end. The homepage CTA runs this same command.",
    command: "pnpm dlx helpbase init",
    registryUrl: "https://helpbase.dev/r/helpbase.json",
    tag: "recommended",
  },
  {
    id: "create-helpbase",
    title: "Greenfield project",
    description:
      "Scaffold a fresh Next.js app with helpbase pre-installed. Good for new docs sites where you don't already have a repo.",
    whenToUse:
      "You're starting from scratch and want the full help center as a standalone project.",
    command: "pnpm dlx create-helpbase",
    tag: "greenfield",
  },
]

const PIECES: InstallOption[] = [
  {
    id: "help-center",
    title: "Help center only",
    description:
      "The docs UI primitive: routes, MDX pipeline, search, sidebar, TOC, and starter content. Everything you need for a shadcn-native help center, without the MCP server or CI workflow.",
    whenToUse:
      "You want the docs site but not the AI/CI layers yet. You'll add those later, or you're integrating into an existing docs pipeline.",
    command: "pnpm dlx shadcn@latest add https://helpbase.dev/r/help-center.json",
    registryUrl: "https://helpbase.dev/r/help-center.json",
  },
  {
    id: "helpbase-workflow",
    title: "Sync workflow only",
    description:
      "A single GitHub Actions file that opens a citation-grounded PR whenever code and docs drift. Zero config, zero secrets — auth via OIDC. Requires MDX already on disk.",
    whenToUse:
      "Your repo already has docs (fumadocs, custom MDX, whatever) and you just want the CI loop that keeps them honest against code changes.",
    command: "pnpm dlx shadcn@latest add https://helpbase.dev/r/helpbase-workflow.json",
    registryUrl: "https://helpbase.dev/r/helpbase-workflow.json",
  },
  {
    id: "helpbase-mcp",
    title: "MCP server only",
    description:
      "A self-hosted Model Context Protocol server that exposes your docs to Claude, Cursor, Zed, and other AI agents. Runs from your repo, reads your MDX, serves over stdio.",
    whenToUse:
      "Your docs already exist and you want to make them agent-readable without adding a docs UI or a CI workflow.",
    command: "pnpm dlx shadcn@latest add https://helpbase.dev/r/helpbase-mcp.json",
    registryUrl: "https://helpbase.dev/r/helpbase-mcp.json",
  },
]

const COMPONENTS: InstallOption[] = [
  {
    id: "help-center-search",
    title: "Search dialog",
    description:
      "Cmd+K search dialog for help center articles. Keyboard-navigable with arrow keys. Pulls from your MDX at build time.",
    whenToUse: "Add search to an existing docs site.",
    command: "pnpm dlx shadcn@latest add https://helpbase.dev/r/help-center-search.json",
    registryUrl: "https://helpbase.dev/r/help-center-search.json",
    tag: "component",
  },
  {
    id: "help-center-sidebar",
    title: "Docs sidebar",
    description:
      "Collapsible docs sidebar with category icons, active indicators, and a mobile drawer. Reads from your content directory structure.",
    whenToUse: "Replace your existing docs sidebar without rewriting your MDX pipeline.",
    command: "pnpm dlx shadcn@latest add https://helpbase.dev/r/help-center-sidebar.json",
    registryUrl: "https://helpbase.dev/r/help-center-sidebar.json",
    tag: "component",
  },
  {
    id: "help-center-toc",
    title: "Table of contents",
    description:
      "Scroll-spy table of contents with a sliding active indicator. Clerk-style design.",
    whenToUse: "Drop into any MDX page to give readers section navigation.",
    command: "pnpm dlx shadcn@latest add https://helpbase.dev/r/help-center-toc.json",
    registryUrl: "https://helpbase.dev/r/help-center-toc.json",
    tag: "component",
  },
]

function OptionCard({ option }: { option: InstallOption }) {
  return (
    <article className="border-border bg-card rounded-2xl border p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-foreground text-lg font-medium">{option.title}</h3>
          {option.tag && (
            <span className="bg-muted text-muted-foreground mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium">
              {option.tag === "recommended"
                ? "Recommended"
                : option.tag === "greenfield"
                  ? "New project"
                  : "Component"}
            </span>
          )}
        </div>
        {option.registryUrl && (
          <Link
            href={option.registryUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline">
            registry.json ↗
          </Link>
        )}
      </div>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{option.description}</p>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
        <strong className="text-foreground font-medium">When to use:</strong> {option.whenToUse}
      </p>
      <div className="mt-5">
        <InstallCommand command={option.command} optionId={option.id} />
      </div>
    </article>
  )
}

export default function InstallCatalogPage() {
  return (
    <>
      <Header />
      <main id="main" role="main" className="bg-background">
        <div className="mx-auto max-w-4xl px-6 py-16 md:py-24">
          <header className="mb-12">
            <h1 className="text-foreground text-4xl font-medium tracking-[-0.02em] md:text-5xl">
              Install options
            </h1>
            <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
              One command for everything, or compose the pieces. All primitives are shadcn-native — the files land in your repo, you own them.
            </p>
          </header>

          <section aria-labelledby="primary-heading" className="mb-14">
            <h2 id="primary-heading" className="text-foreground mb-5 text-xl font-medium">
              Start here
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {PRIMARY.map((option) => (
                <OptionCard key={option.id} option={option} />
              ))}
            </div>
          </section>

          <section aria-labelledby="pieces-heading" className="mb-14">
            <h2 id="pieces-heading" className="text-foreground mb-5 text-xl font-medium">
              Individual primitives
            </h2>
            <p className="text-muted-foreground mb-5 max-w-2xl text-sm">
              Prefer composability? Each piece stands alone. Install any subset; run{" "}
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">helpbase init</code>{" "}
              later to pull in the rest.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {PIECES.map((option) => (
                <OptionCard key={option.id} option={option} />
              ))}
            </div>
          </section>

          <section aria-labelledby="components-heading">
            <h2 id="components-heading" className="text-foreground mb-5 text-xl font-medium">
              Standalone components
            </h2>
            <p className="text-muted-foreground mb-5 max-w-2xl text-sm">
              Pull individual pieces of the help center UI into a docs site you already have.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {COMPONENTS.map((option) => (
                <OptionCard key={option.id} option={option} />
              ))}
            </div>
          </section>
        </div>
      </main>
      <FooterSection />
    </>
  )
}
