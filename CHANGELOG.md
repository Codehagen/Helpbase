# Changelog

All notable changes to helpbase will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Semantic search for `@helpbase/mcp` (opt-in).** New `helpbase-mcp-build-index`
  bin writes a `.search-index.json` beside your content dir using
  `@xenova/transformers` (default model `Xenova/all-MiniLM-L6-v2`, 384-dim,
  quantized). The MCP server auto-loads it at startup and swaps
  `search_docs` from keyword match to embeddings-based ranking so
  paraphrased queries ("authenticate my requests") resolve to the right
  doc even when title/body don't share tokens. `@xenova/transformers` is
  an **optional peer dep** — keyword search remains the zero-install
  default. Stale/missing/malformed index logs to stderr and falls back to
  keyword rather than crashing the server. 19 new semantic tests cover
  cosine geometry, ranking correctness, round-trip save/load, and every
  malformed-index path using an injected fake embedder (no model
  download required in CI).
- **`helpbase generate --repo <path>` — generate articles from local repo markdown.**
  Walks a directory, picks up `.md`/`.mdx`/`.markdown` files, skips build/VCS
  dirs, README-first ordering, concatenates with per-file headers, and feeds
  the same article-plan pipeline as `--url`. Supports `--dry-run`, `--debug`,
  `--test`, `--model`, `--output`. Replaces the previous "not yet implemented"
  stub. GitHub URL ingestion (public `owner/repo` via Contents API) deferred
  until there's demand — local paths cover the dogfood flow.
- **`@helpbase/mcp` — self-hosted MCP server for AI agents.** New package at
  `packages/mcp/`. Runs over stdio, reads MDX from your repo, exposes three
  tools (`search_docs`, `get_doc`, `list_docs`) to any MCP client (Claude
  Desktop, Cursor, Zed, Windsurf). Auto-detects `apps/web/content/` and
  `./content/` layouts; `HELPBASE_CONTENT_DIR` env var overrides. Malformed
  frontmatter is skipped with a stderr warning rather than crashing the server.
  Ships with a stdout-pollution regression test that spawns the real binary
  and asserts every stdout line is valid JSON-RPC.
- **`llms.txt` + `llms-full.txt` auto-generation.** Every `pnpm build`
  emits `apps/web/public/llms.txt` (navigation summary, one bullet per doc)
  and `apps/web/public/llms-full.txt` (full content concatenation) per the
  published spec. Generated from the same MDX source as the rendered site.
  New `pnpm smoke:llms` validates both artifacts after build.
- **Documentation as AI-native knowledge layer.** The combination of the MCP
  server and `llms.txt` means every helpbase site becomes queryable both by
  AI crawlers (via the static text files) and by agent tools (via MCP), with
  the server running on your own infrastructure and your docs never leaving
  your filesystem.
- **`shadcn add helpbase-mcp` — MCP server as code in your repo.** New shadcn
  registry item ships the MCP server source (not a vendored binary) at `mcp/`
  in the user's tree. One command:
  `npx shadcn@latest add https://helpbase.dev/r/helpbase-mcp.json` drops
  `mcp/index.ts`, `mcp/server.ts`, `mcp/content/*`, `mcp/tools/*`, and
  `mcp/README.md`, installs `@modelcontextprotocol/sdk` + `gray-matter` +
  `zod`, adds `tsx` as a devDep, and creates `.env.local` with a
  `HELPBASE_CONTENT_DIR=` placeholder. The code-ownership path alongside
  the `npm i @helpbase/mcp` zero-config path — same server, opposite
  posture. Registry source at `registry/helpbase-mcp/`.
- **`llms.txt` in every `create-helpbase` scaffold.** The customer template
  now ships `scripts/generate-llms.mjs` and wires it into `prebuild` +
  `predev`, so every newly scaffolded helpbase project emits `llms.txt` and
  `llms-full.txt` on every build without any setup. Configuration via
  `HELPBASE_SITE_URL`, `HELPBASE_PROJECT_NAME`, and `HELPBASE_SUMMARY` env
  vars, with fallbacks to the customer's `package.json` fields. Absent a
  site URL, emits relative paths with a stderr warning. Generator source
  lives at `packages/create-helpbase/template-assets/` and is copied into
  the templates tree by `scripts/sync-templates.mjs`.
- Three new templates for `helpbase new`: `getting-started` (intro
  walkthrough), `how-to` (task guide), and `concept` (explainer). Each is
  MDX-native with `<Steps>`, `<Callout>`, and `<CardGroup>` and ~40-80 lines
  of realistic body copy so users only lightly edit before publishing.
- `helpbase new` now runs fully interactively with no args: pick a
  template, pick or create a category, enter a title and optional
  description. `--type`/`--title`/`--description` flags still work for
  scripting.
- `helpbase login`, `helpbase logout`, `helpbase whoami` — standalone auth
  commands. Previously auth was inline inside `deploy`.
- `HELPBASE_TOKEN` environment variable for non-interactive (CI) use of
  `helpbase deploy`. Pair with `--slug` to skip all prompts.
- `helpbase link` — bind a local project to a tenant via `.helpbase/project.json`.
  Commit the file so teammates deploy to the same tenant. `--slug` for
  non-interactive linking, `--remove` to unlink.
- `helpbase open` — launch the linked help center in the default browser.
  `--print` outputs the URL instead for CI / scripts.
- `dev` pre-flight: detects when you run `helpbase dev` outside a helpbase
  project and points you at `npx create-helpbase` instead of failing with
  a raw npm error.
- `create-helpbase` post-scaffold card now shows the full happy path:
  run locally → AI-generate articles → deploy to the cloud.
- Dev/QA harness: `scripts/mint-test-token.mjs` mints a real user JWT via
  the Supabase admin API without sending email. Run with
  `SUPABASE_SERVICE_ROLE_KEY` set. Unlocks end-to-end CLI tests.

### Changed
- `helpbase add` has been folded into `helpbase new`. Use `helpbase new`
  with no args for the interactive flow. **Breaking:** anyone scripting
  against `helpbase add` should switch to `helpbase new`. Article
  frontmatter is now JSON-encoded, so titles and descriptions with quotes
  or backslashes no longer break the YAML.
- `helpbase deploy` now prefers `.helpbase/project.json` over the old
  owner-based tenant lookup. On first deploy it backfills the file so
  subsequent deploys (and teammates) are deterministic.
- `deploy` success message now nudges `helpbase open`.

### Internal
- Auth is now isolated in `lib/auth.ts` behind a provider-agnostic interface
  (`AuthSession`, `getCurrentSession`, `sendLoginCode`, `verifyLoginCode`).
  The future Better Auth swap is a one-file rewrite.

## [0.0.1] — 2026-04-08

### Added
- Initial release: `helpbase dev`, `helpbase generate` (URL + screenshots),
  `helpbase audit`, `helpbase add`, `helpbase new`, `helpbase deploy`.
- `create-helpbase` scaffolder with `--url` for AI-generated initial content.
- shadcn registry at `helpbase.dev/r/help-center.json` for dropping the
  help center into existing Next.js apps.

[Unreleased]: https://github.com/Codehagen/helpbase/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/Codehagen/helpbase/releases/tag/v0.0.1
