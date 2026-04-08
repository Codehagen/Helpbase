<div align="center">

# helpbase

**The open-source help center for Next.js.**

Scaffold a beautiful, production-ready help center in under two minutes.
Generate articles from any URL with AI. Drop it into an existing app with
a single `shadcn add` command. Own every line.

[![npm version](https://img.shields.io/npm/v/helpbase.svg?color=111)](https://www.npmjs.com/package/helpbase)
[![license](https://img.shields.io/badge/license-AGPL--3.0-111)](./LICENSE)
[![stars](https://img.shields.io/github/stars/Codehagen/helpbase?color=111)](https://github.com/Codehagen/helpbase/stargazers)
[![made with shadcn/ui](https://img.shields.io/badge/made%20with-shadcn%2Fui-111)](https://ui.shadcn.com)

<br />

<!-- TODO: add a hero screenshot or recording here. Recommended: docs page with sidebar + TOC, 1600x840, light mode, saved at apps/web/public/og.png -->

<br />

**[Website](https://helpbase.dev)** · **[Demo](https://helpbase.dev/docs)** · **[Registry](https://helpbase.dev/r/help-center.json)** · **[@CodeHagen](https://x.com/CodeHagen)**

</div>

<br />

## Why helpbase

Shipping a help center usually means picking between a hosted SaaS with a
monthly bill and a blank Next.js project you still have to wire up. helpbase
closes that gap. It is the full help center, built once, so you can scaffold
a new project or drop it into the Next.js app you already have.

Everything is yours. Every component, every route, every line of content
lives in your repo. You keep your stack, your deploy pipeline, and your
control over the UX. No vendor lock, no runtime fees, no dashboard to log
into.

## Features

- **One command to ship** — `npx create-helpbase` scaffolds a working help center in under two minutes
- **Drop into existing apps** — `npx shadcn add https://helpbase.dev/r/help-center.json` adds the full block to any Next.js + shadcn/ui project
- **AI article generation** — point the CLI at any URL and get real MDX articles back, grounded in the scraped content
- **MDX content pipeline** — gray-matter frontmatter, remark-gfm, rehype-slug, syntax highlighting, zero config
- **Docs-style layout** — sidebar with active states, sticky header, command-palette search, table of contents with scroll-spy
- **Dark mode + light mode** — next-themes baked in, respects system preference, no flash on load
- **Responsive + mobile-ready** — mobile drawer, responsive layouts, keyboard shortcuts
- **Type-safe content** — Zod schemas validate frontmatter at build time, catch missing fields before deploy
- **Content audit CLI** — `helpbase audit` catches missing titles, broken schemas, and empty categories in CI
- **Reduced-motion aware** — animations respect `prefers-reduced-motion`
- **Production-tested** — 94 tests across the CLI, scaffolder, and content pipeline, plus an install-path smoke test in CI

## Quick start

The fastest way to try helpbase. Works on macOS, Linux, and Windows. Requires
Node 20+ and pnpm or npm.

```bash
npx create-helpbase my-help-center
cd my-help-center
pnpm dev
```

Open http://localhost:3000 and you have a working help center with sample
articles. Edit the markdown in `content/` and the dev server hot-reloads.

### Generate articles from your site with AI

Pass `--url` and helpbase scrapes the page, sends it through the Vercel AI
Gateway, and writes structured MDX articles to `content/`. Each article
comes back with a title, description, tags, and a full markdown body.

```bash
export AI_GATEWAY_API_KEY=your_key_here
npx create-helpbase my-help-center --url https://yourproduct.com --test
```

Get your key at [vercel.com/ai-gateway](https://vercel.com/ai-gateway). The
`--test` flag uses Gemini 3.1 Flash Lite for cheap, fast generation. Pass
`--model anthropic/claude-sonnet-4.6` (or any Gateway-supported model) to
override.

### Drop into an existing Next.js app

If you already have a Next.js + shadcn/ui project, add helpbase as a shadcn
registry block. This installs all 23 files (the `app/(docs)/` routes, the
components, the MDX content pipeline, the sample articles, and the
helpbase-specific CSS) plus pulls the `badge` primitive from shadcn. After
it runs you can navigate to `/getting-started/introduction` and see a
rendered article:

```bash
npx shadcn@latest add https://helpbase.dev/r/help-center.json
```

Prerequisite: your project must have `components.json` (i.e. you've run
`npx shadcn@latest init` at some point). If not, run that first.

What gets installed:

- `app/(docs)/layout.tsx` — sidebar shell + Cmd+K search, drops into your existing root layout additively
- `app/(docs)/[category]/page.tsx` + `[slug]/page.tsx` — category index and article renderer
- `app/(docs)/helpbase-styles.css` — animations, keyframes, and MDX article typography (imported by the docs layout, no root-layout changes needed)
- `components/*.tsx` — header, footer, sidebar, search dialog, TOC, theme provider (8 files, all yours to edit)
- `lib/content.ts`, `lib/search.ts`, `lib/toc.ts`, `lib/schemas.ts`, `lib/slugify.ts`, `lib/types.ts` — MDX loader, search index, zod schemas
- `content/getting-started/*` and `content/customization/*` — three sample articles to prove the pipeline works

What does NOT get touched: your `app/layout.tsx`, your `app/page.tsx`,
your existing `components/ui/*`. Helpbase's CSS variables (sidebar colors,
`--font-heading`) get merged into your `app/globals.css` by shadcn's
standard cssVars merge.

Four registry items are available for more targeted adoption:

| Item | Install |
|---|---|
| Full help center | `npx shadcn@latest add https://helpbase.dev/r/help-center.json` |
| Command-palette search | `npx shadcn@latest add https://helpbase.dev/r/help-center-search.json` |
| Docs sidebar | `npx shadcn@latest add https://helpbase.dev/r/help-center-sidebar.json` |
| Table of contents | `npx shadcn@latest add https://helpbase.dev/r/help-center-toc.json` |

Both install paths (`create-helpbase` and `shadcn add`) produce the same
flat `components/`, `lib/`, and `content/` layout so you can start with
either and never have to rename anything.

## What you get

A flat, editable Next.js project that mirrors the code in `apps/web/`. No
`helpbase/` subdirectories, no hidden files you can't touch. Everything
lives at the path you would expect, ready to rename, delete, or refactor.

```
my-help-center/
├── app/
│   ├── (docs)/
│   │   ├── [category]/
│   │   │   ├── [slug]/page.tsx     three-column layout (sidebar | content | TOC)
│   │   │   └── page.tsx             category index with article cards
│   │   └── layout.tsx               docs layout with header, sidebar, mobile drawer
│   ├── favicon.ico
│   ├── globals.css                  Tailwind v4 tokens + theme variables
│   ├── layout.tsx                   root layout with theme provider
│   └── page.tsx                     marketing homepage
├── components/                       all the UI pieces, yours to edit
│   ├── docs-sidebar.tsx
│   ├── footer.tsx
│   ├── header.tsx                   sticky header with search trigger + theme toggle
│   ├── mobile-sidebar.tsx
│   ├── search-dialog.tsx            Cmd+K command palette
│   ├── search-trigger.tsx
│   ├── theme-provider.tsx
│   ├── toc.tsx                      table of contents with scroll-spy
│   └── ui/
│       └── badge.tsx                shadcn primitive
├── content/                          the articles — edit, delete, regenerate
│   ├── customization/
│   │   ├── _category.json           category metadata (title, description, icon)
│   │   └── theming.mdx
│   └── getting-started/
│       ├── _category.json
│       ├── configuration.mdx
│       └── introduction.mdx
└── lib/                              loaders, schemas, helpers — inlined, not aliased
    ├── content.ts                   MDX loader with frontmatter validation
    ├── schemas.ts                   Zod schemas for frontmatter + category metadata
    ├── search.ts                    client-side search index builder
    ├── slugify.ts
    ├── toc.ts                       heading extraction for the TOC
    ├── types.ts
    └── utils.ts
```

Plus standard Next.js config files at the root (`next.config.mjs`,
`tsconfig.json`, `components.json`, `postcss.config.mjs`, `eslint.config.mjs`,
`package.json`, `.gitignore`). When you run `npx create-helpbase`, these 37
files are copied in directly from committed templates — no code generation,
no runtime transforms, nothing to audit or mistrust.

## AI article generation

helpbase uses the [Vercel AI SDK](https://ai-sdk.dev) + [AI Gateway](https://vercel.com/ai-gateway)
for generation. One env var, one string-typed model ID, no provider SDKs.

Generate articles any time after scaffolding:

```bash
helpbase generate --url https://yourproduct.com              # default model
helpbase generate --url https://yourproduct.com --test       # cheap + fast (Gemini Flash Lite)
helpbase generate --url https://yourproduct.com --model anthropic/claude-sonnet-4.6
helpbase generate --url https://yourproduct.com -o content/ai-generated
```

The generator produces structured articles:

- **Action-oriented titles** — "How to reset your password", not "Password resets"
- **One-sentence descriptions** — no marketing copy
- **Natural categories** — Getting Started, Account & Billing, Features, Troubleshooting
- **Real code examples** — pulled from whatever the scraped page mentions
- **Type-safe output** — generated via `generateObject` against a Zod schema, so the output matches your content schema or the CLI errors

Articles land in `content/<category>/<article>.mdx` with valid frontmatter.
Edit, delete, or regenerate any of them. You own them.

## CLI reference

```bash
helpbase dev                    # start the Next.js dev server
helpbase generate --url <url>   # generate articles from a URL
helpbase audit                  # validate frontmatter, categories, schema
helpbase add                    # add a new article or category interactively
helpbase --help                 # show all commands
```

Every command fails loudly with a clear error when something is wrong. No
silent exits, no "coming soon" messages that look like success. Errors
include the problem, the cause, the fix, and a link to the docs.

## Content model

Articles are MDX files with Zod-validated frontmatter:

```markdown
---
schemaVersion: 1
title: "How to reset your password"
description: "Walk through the password recovery flow end to end."
tags: ["account", "security"]
order: 1
featured: false
---

## Before you start

You need access to the email address on your account.

## Steps

1. Click **Forgot password** on the sign-in screen.
2. Enter your email.
3. Check your inbox for the reset link.
```

Categories are directories with an optional `_category.json`:

```json
{
  "title": "Getting Started",
  "description": "Everything you need to get up and running",
  "icon": "sparkles",
  "order": 1
}
```

Run `helpbase audit` in CI to catch missing fields, empty categories, and
schema drift before they hit production.

## Project structure

This repo is a pnpm + Turborepo monorepo.

```
helpbase/
├── apps/
│   └── web/                           the helpbase.dev site, built with helpbase itself
├── packages/
│   ├── cli/                           helpbase CLI (dev, generate, audit, add)
│   ├── create-helpbase/               npx create-helpbase scaffolder
│   │   └── templates/                 committed snapshot of the scaffolded project
│   ├── shared/                        shared schemas, AI helpers, slugify
│   └── ui/                            shadcn/ui components used by apps/web
├── registry/
│   └── helpbase/                      shadcn registry source files
├── public/
│   └── r/                             built registry JSON (served from helpbase.dev)
└── scripts/
    ├── sync-templates.mjs             regenerates create-helpbase/templates/ from apps/web
    ├── smoke-install.sh               end-to-end install-path test (used by CI)
    └── smoke-test.sh                  AI generation smoke test (see SMOKE.md)
```

The `packages/create-helpbase/templates/` directory is the single source
of truth for what `npx create-helpbase` produces. It is generated from
`apps/web/` by `pnpm sync:templates` and committed to git so every PR shows
the real diff. CI gates drift — editing `apps/web/` without re-running
sync fails the build.

## Development

You need Node 20+ and pnpm 9+.

```bash
git clone https://github.com/Codehagen/helpbase.git
cd helpbase
pnpm install
pnpm dev                 # runs apps/web on :3000
pnpm build               # builds everything
pnpm test                # runs the full test suite (94 tests)
pnpm typecheck           # checks types across all packages
```

Every package has its own `pnpm test`. Run the CLI locally with
`pnpm --filter helpbase dev`, then use `node packages/cli/dist/index.js`
from any directory to test against a scaffolded project.

## Testing the CLI against a real project

```bash
# Scaffold a disposable project
cd /tmp
node /path/to/help-center/packages/create-helpbase/dist/index.js my-test \
  --no-install --no-open < /dev/null

# Generate AI articles into it
cd my-test
AI_GATEWAY_API_KEY=your_key node /path/to/help-center/packages/cli/dist/index.js \
  generate --url https://vercel.com --test
```

The CLI works non-interactively with stdin detached, so it plays nicely with
CI pipelines and scripts.

## Roadmap

- [x] Next.js 16 + App Router + Turbopack
- [x] shadcn/ui components and registry
- [x] MDX content pipeline with Zod validation
- [x] Docs-style sidebar layout with active states
- [x] Command-palette search (`Cmd+K`)
- [x] Table of contents with scroll-spy
- [x] Dark mode + reduced-motion support
- [x] `npx create-helpbase` scaffolder
- [x] `helpbase` CLI with `dev`, `generate`, `audit`, `add`
- [x] AI article generation via Vercel AI Gateway
- [x] shadcn registry with four installable blocks
- [ ] Full-text search via Orama (current search is title + description)
- [ ] i18n support for multi-language help centers
- [ ] Analytics events for article views and search queries
- [ ] Versioned docs for products with multiple major versions
- [ ] Plugin API for custom MDX components

## Tech stack

- [Next.js 16](https://nextjs.org) with App Router and Turbopack
- [React 19](https://react.dev)
- [shadcn/ui](https://ui.shadcn.com) components
- [Tailwind CSS v4](https://tailwindcss.com)
- [next-mdx-remote](https://github.com/hashicorp/next-mdx-remote) for MDX
- [Vercel AI SDK](https://ai-sdk.dev) + [AI Gateway](https://vercel.com/ai-gateway) for generation
- [Zod](https://zod.dev) for schema validation
- [Commander](https://github.com/tj/commander.js) and [@clack/prompts](https://github.com/natemoo-re/clack) for CLI UX
- [Vitest](https://vitest.dev) for testing
- [Turborepo](https://turbo.build) for the monorepo
- [tsup](https://tsup.egoist.dev) for CLI bundling

## Contributing

Contributions are welcome. The project is small enough that anyone can read
the whole codebase in an afternoon and start shipping fixes.

1. Fork and clone the repo
2. `pnpm install`
3. Make your change, add a test, run `pnpm test` and `pnpm typecheck`
4. Open a PR with a clear title and description

For bigger changes, open an issue first so we can align on the direction
before you write code. If you find a bug, include a repro with the exact
command that triggers it.

### Contributing to the AI prompt

The prompt that turns a scraped page into help articles lives in
[`packages/shared/src/ai.ts`](./packages/shared/src/ai.ts) in the
`buildPrompt` function. It is the highest-leverage surface in the project:
a good edit improves every article every contributor and user will ever
generate.

The unit tests are all mocked, so they can't tell you if your prompt
change produces better articles. For that, helpbase ships a real-world
smoke test:

```bash
export AI_GATEWAY_API_KEY=your_key_here     # free $5 credit at vercel.com/ai-gateway
pnpm smoke --baseline                        # runs committed prompt + your prompt, side by side
```

The script hits `vercel.com` and `resend.com` twice (once with the
committed prompt, once with your working-tree prompt) and drops the output
in `/tmp/helpbase-smoke-*/baseline/` and `/tmp/helpbase-smoke-*/current/`.
Open both folders in your editor and diff. Are the current articles
sharper? More concrete? Fewer hallucinations? That's the evidence that
goes in your PR.

Each full baseline run costs ~$0.04-0.10 on Gemini Flash Lite. See
[SMOKE.md](./SMOKE.md) for the full grading rubric, failure triage, and PR
checklist.

## License

[AGPL-3.0-only](./LICENSE). The open-source core is copyleft — any hosted
derivative must share its source. If you need a different license for a
commercial offering, reach out to [@CodeHagen](https://x.com/CodeHagen).

## Credits

Built by [@CodeHagen](https://x.com/CodeHagen). Powered by
[shadcn/ui](https://ui.shadcn.com), [Vercel](https://vercel.com), and the
open source community.

If helpbase saved you time, consider [starring the repo](https://github.com/Codehagen/helpbase)
— it helps other developers find it.
