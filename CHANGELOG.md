# Changelog

All notable changes to helpbase will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **`helpbase context` renamed to `helpbase ingest`.** `context` described
  a domain concept, not an action — `ingest` names what the command does
  (walk your code + markdown, synthesize cited how-tos, wire MCP). The
  old name continues to work as a deprecation shim: same flags, same
  behavior, one-line stderr warning, suppressed under `--json`/`--quiet`.
  Help text + README Quick Start + scaffolder next-steps output now lead
  with `ingest`. CI scripts pinned to `helpbase context` keep working
  until v0.7, which is when the shim is removed. Flag surface is shared
  via `applyIngestOptions()` so the two commands can't drift. First PR
  of the CLI DX v2 plan.

### Added
- **Unit tests for the device-authorize state machine.** Extracted the
  8-phase `Phase` union from `AuthorizeDeviceClient` into a pure
  `phaseReducer` function so every transition can be verified without
  React, the DOM, or Better Auth mocks. Adds 20 reducer unit tests
  (100% branch coverage) and 15 thin integration tests covering the
  effect derivation, providers-prop rendering, and async handler
  dispatch sites. Also wires up `@vitejs/plugin-react` + jsdom so
  future component tests in `apps/web` have a working harness.
- **Branded HTML magic-link email.** The sign-in email is now a React
  Email component (`apps/web/emails/sign-in-magic-link.tsx`) matching
  the editorial-technical look of the site — helpbase wordmark, near-
  black primary CTA, cool-neutral palette, 10-minute expiry copy, and a
  tuned plain-text fallback for clients that don't render HTML. Preview
  locally with `pnpm -F web email`.
- **OAuth providers on `/device`.** Opt-in Google + GitHub sign-in
  buttons render above the magic-link form when the provider's
  `*_CLIENT_ID` and `*_CLIENT_SECRET` env vars are configured on the
  server. Buttons stay hidden until configured, and the email
  magic-link path always remains available as a fallback. Cold-path
  TTHW drops from ~60s (email round-trip) to ~20s (one-click OAuth).

## [helpbase 0.5.0] — 2026-04-17

### Added
- **`helpbase login` now uses a browser device-flow by default.** Run
  `helpbase login` and the CLI opens your browser at
  `helpbase.dev/device?user_code=ABCD-EFGH`, where you click Authorize
  and the terminal picks up your bearer token. Under 10 seconds on the
  fast path. No more email round-trip, no more paste-back dance. Built
  on Better Auth's `deviceAuthorization` plugin (RFC 8628 device grant).
  The old magic-link email flow is preserved behind
  `helpbase login --email` as the fallback for CI and sandboxed envs.
- **Server-side tenant API** under `/api/v1/tenants/*`. `helpbase deploy`,
  `helpbase link`, and `helpbase open` now call typed HTTP endpoints
  instead of talking to Supabase directly. Ownership checks happen in
  the server routes using Better Auth session verification.
- **Progressive polling hints** during device-flow wait: the spinner
  surfaces targeted help at T+30s / T+90s / T+4min so the YC-founder
  first-run doesn't hit a silent 3-minute staring contest.

### Changed
- **Auth backend migrated from Supabase Auth to Better Auth.** The CLI
  and the hosted API now authenticate via Better Auth (bearer + magic-link
  + device-authorization plugins). The `~/.helpbase/auth.json` shape and
  `HELPBASE_TOKEN` env contract are preserved — no action required for
  existing installs. Emails now deliver via Resend.
- `helpbase login` auto-detects headless environments (Codespaces,
  SSH sessions) and skips the browser spawn; prints the URL for manual
  copy-paste instead. Override with `HELPBASE_LOGIN_NO_BROWSER=1` in
  any environment.

### Fixed
- `~/.helpbase/auth.json` is now force-narrowed to mode `0600` on every
  write (previously only on file creation, which left stale-permissioned
  files loose on shared dev machines).

### Security
- `mcp_public_token` is no longer readable by the anon Supabase key.
  The `tenants` table lost its anon SELECT grant; anon-facing reads go
  through a new `tenants_public` view that projects only id/slug/name/
  active/theme_config. Closes a pre-existing leak where the embedded
  CLI anon key could enumerate every active tenant's MCP bearer.
- Resend API key is now required in production. Without it, the auth
  config fails boot rather than silently printing magic-link URLs to
  Vercel Runtime Logs (dev-mode console fallback is gated on
  `NODE_ENV !== "production"`).

### Internal
- `packages/cli/src/lib/auth.ts` split into `auth.ts` (session core) +
  `auth-device.ts` (device-flow state machine). 387 → 265 LOC on the
  main file.
- 41 new tests across 4 new suites covering the auth surface:
  `extractVerificationToken`, `deviceLogin`, `pollDeviceAuth`,
  `consumeMagicLink`, `verifyLoginFromMagicLink`, `getCurrentSession`,
  `withAuthAndQuota`, and the CLI `toAuthSession` factory.
- Removed the CLI's dependency on `@supabase/supabase-js`. The CLI now
  talks to helpbase.dev over plain `fetch`. Lean install, one less
  auth chain to maintain.

## [helpbase 0.4.1] — 2026-04-17

### Fixed
- **`helpbase login` accepts a pasted magic-link URL, not just a 6-digit code.** Supabase's default email template sends only a clickable magic link (no code), so users who ran `helpbase login` got an email, saw no code, and watched the CLI wait forever for input. The prompt now accepts either form: a full URL with `#access_token=...` OR a 6-digit code for projects whose template includes `{{ .Token }}`. The URL path decodes the session in-process without a second Supabase round-trip.
- Tracking `TODO-020` in `TODOS.md` for the real fix — a proper device flow à la Claude Code / Supabase CLI / `gh auth login` that bounces the user to `helpbase.dev/login/cli/<session>`, skips email entirely, and polls from the CLI. Needs its own plan review before shipping.

## [create-helpbase 0.3.1] — 2026-04-17

### Changed
- **Auth prompt leads with `helpbase login`, not BYOK.** When the user
  picks a repo or URL source and has no existing session / AI Gateway
  key, the scaffolder now offers a three-way select:
  - Log in (runs `helpbase login` inline — free, no card, 500k tokens/day)
  - Paste a Vercel AI Gateway key
  - Skip and ship with sample content

  Motivation: burying the login path behind a "couldn't generate, try
  `helpbase login`" error message leaves leads on the floor. Surfacing
  it at the decision point captures evaluators who are already asking
  for the value, without forcing signup on users who pick "Skip".

  Login spawns as a subprocess with inherited stdio (so the email → OTP
  flow runs natively), via `pnpm dlx` / `npx` / `bunx` / `yarn dlx`
  matching the user's package manager. The scaffolder re-reads
  `~/.helpbase/auth.json` after the subprocess exits and continues
  with the freshly-minted token.

## [0.4.0] — 2026-04-17

### Added
- **Unified scaffolder — `npx create-helpbase` now seeds content from a
  URL, a local repo, a GitHub URL, or sample content.** One explicit
  prompt picks the source. The repo and GitHub paths run the same
  synthesis pipeline as `helpbase context` (cited how-tos + MDX +
  `## Sources` sections), written straight into the scaffolded
  `content/` directory. Pairs with an `mcp.json` hint at the project
  root so the user can paste a block into Claude Desktop / Cursor /
  Claude Code immediately.
  - `create-helpbase 0.2.1` → `0.3.0`.
  - Champion-tier TTHW target: under 2 min scaffold + synthesize +
    auto-open browser at `http://localhost:3000` with cited docs
    from the user's own source files.
  - Conditional BYOK prompt — if `~/.helpbase/auth.json` exists or
    `AI_GATEWAY_API_KEY` is set, the key prompt is skipped entirely.
  - Three-stage spinner (Scanning → Synthesizing → Writing) so the
    10-25s LLM call no longer reads as a hang.
  - Browser auto-open — scaffolder tails the Next.js dev server
    stdout and opens `http://localhost:3000` on the "Ready in" signal.
  - GitHub URL detection — pasted `github.com/foo/bar` URLs prompt
    the user with "Clone and generate from source?" and route to
    the repo branch on accept (shallow clone to a temp dir, cleaned
    up post-scaffold).
- **Walker deny-list — `helpbase context` now skips codegen output
  directories and lockfiles automatically.** Added to the built-in
  skip list: `generated/`, `__generated__/`, `target/`, `.nuxt/`,
  `.svelte-kit/`, `.wrangler/`. Added file-name skip: `pnpm-lock.yaml`,
  `package-lock.json`, `yarn.lock`, `bun.lockb`, `Cargo.lock`,
  `Gemfile.lock`, `poetry.lock`, `Pipfile.lock`, `composer.lock`. Added
  suffix skip: `*.min.js`, `*.min.css`, `*.map`, `*.snap`,
  `*.d.ts.map`. Fixes the "repo with Prisma codegen blows the default
  100k token budget" problem.

### Fixed
- **`create-helpbase` no longer wipes sample content before the LLM
  call.** Previous releases called `clearSampleContent` BEFORE the LLM
  ran; any failure (missing auth, quota hit, gateway error) left the
  user with an empty `content/` directory and a message claiming
  "sample content remains" — a lie. The clear now fires in the
  writing phase, only after the model returned valid articles.

### Packages
- `helpbase` CLI: `0.3.0` → `0.4.0`
- `create-helpbase`: `0.2.1` → `0.3.0`
- `@workspace/shared`: walker deny-list (internal, not published)

## [0.3.0] — 2026-04-17

### Added
- **Bundled AI key — `helpbase context`, `--ask`, and every other
  LLM-backed CLI command now work without the user bringing an
  `AI_GATEWAY_API_KEY`.** helpbase owns a Vercel AI Gateway key
  server-side and proxies LLM calls through `helpbase.dev/api/v1/llm/*`.
  First-time user flow is now `npx helpbase login` → `npx helpbase context .`
  with no external signups in between.
  - Per-user daily quota: `500,000` tokens, resets at UTC midnight.
    `helpbase whoami` surfaces `used / cap / resets-in`.
  - Auth: CLI bearer token from `helpbase login` (stored in
    `~/.helpbase/auth.json`) or `HELPBASE_TOKEN` env var for CI.
  - BYOK escape hatch preserved — setting `AI_GATEWAY_API_KEY`
    bypasses the proxy and hits Gateway directly, no quota applied.
    Recommended for power users and anyone who hits the daily cap.
  - New endpoints: `POST /api/v1/llm/generate-text`,
    `POST /api/v1/llm/generate-object`, `GET /api/v1/usage/today`.
    All require `Authorization: Bearer <session-token>`; 401 on
    missing/invalid, 429 on quota exceeded, 503 on global cap.
  - Smoke harness: `scripts/smoke-llm-proxy.sh <base-url> <token>`
    for post-deploy verification.

### Packages
- `helpbase` CLI: `0.2.0` → `0.3.0`
- `create-helpbase`: `0.1.0` → `0.2.1`
  - `0.2.0`: forwards `~/.helpbase/auth.json` session to URL-based
    article generation so first-run scaffolds don't demand a Vercel
    AI Gateway key when the user has already logged in.
  - `0.2.1`: splits the URL-generation spinner into three stages —
    Scraping, Synthesizing (~10-25s), Writing — so the LLM step
    no longer reads as a hang.

## [0.2.0] — 2026-04-16

### Added
- **`helpbase preview` — one-command browser-viewable help center from
  your generated docs.** Point the CLI at any repo with
  `helpbase context .`, then run `helpbase preview` to open the docs
  in a polished help center UI (sidebar, search, theme toggle, MDX
  components, the whole thing) at `http://localhost:3000`. Fills the
  last gap in the "repo → human-readable docs" story — before this,
  the generated MDX was agent-facing only and had no viewer.
  - Cache lives at `~/.helpbase/preview-<cli-version>/` — one install
    per CLI version, shared across all projects on the machine.
  - First run per CLI version: ~45-60s (scaffolds via
    `create-helpbase` + `<pm> install`). Every run after: ~3s.
  - `--reset` wipes the cache and re-scaffolds.
  - `--setup-only` warms the cache without starting the server
    (useful for CI or pre-demo prep).
  - `--port <n>` for port override; picks whichever package manager
    the user has (pnpm > yarn > bun > npm).

### Changed
- **`apps/web` resolves content via the same `HELPBASE_CONTENT_DIR` env
  var the MCP server uses.** Previously hardcoded to `<cwd>/content`.
  One env var now points both the human-facing renderer and the
  agent-facing MCP server at the same docs directory — the foundation
  `helpbase preview` is built on.
- **`helpbase context` next-steps output leads with `helpbase preview`.**
  Users no longer have to hunt for "so how do I actually open this in
  a browser."

### Packages
- `helpbase` CLI: `0.1.0` → `0.2.0`
- `create-helpbase`: `0.0.3` → `0.1.0` (adds env-var-aware content dir,
  required by `helpbase preview`)

## [@helpbase/mcp 0.1.1] — 2026-04-16

### Fixed
- **`npx @helpbase/mcp` no longer fails with "could not determine
  executable to run".** The published `mcp.json` the CLI generates tells
  Claude Desktop / Cursor / Claude Code to spawn the server via
  `npx -y @helpbase/mcp@latest`. npx resolves a scoped package's default
  binary by stripping the scope and looking for a bin of that name —
  `mcp` in our case. `0.1.0` shipped with only `helpbase-mcp`,
  `helpbase-mcp-http`, and `helpbase-mcp-build-index` in the `bin`
  field, so every user who pasted our generated config hit a cryptic
  startup error and the MCP tools never appeared in their client.
  `0.1.1` adds `mcp` as an alias pointing at the stdio server entry,
  matching the scope-trimmed convention. The CLI-emitted config now
  works unmodified.
- **serverInfo reports the real package version** over JSON-RPC. The
  `McpServer` constructor was hardcoded to `0.0.1`, so every client
  saw the same serverInfo regardless of which version was actually
  running. Synced to `0.1.1` and pinned by a test that reads both
  package.json and server.ts on every build.

## [0.1.0] — 2026-04-16

First real release. `helpbase context` is the AI-native flow: point the CLI
at any repo, get cited how-to docs + an MCP endpoint + llms.txt in one
command. Validated end-to-end on a fresh third-party repo — the agent
flow works (MCP `list_docs` over JSON-RPC serves the generated MDX), the
human flow works (cited Sources section, parseable frontmatter, MDX
renders), and the eval gate passes at 80% on Sonnet.

### Packages
- `helpbase` CLI: `0.0.1` → `0.1.0`
- `@helpbase/mcp`: `0.0.1` → `0.1.0` (adds opt-in semantic search)

### Fixed
- **YAML frontmatter parse bug on snippets with leading whitespace.** The
  block-scalar emitter auto-detected indentation from the first content
  line, so a snippet starting with ` *` (JSDoc) locked the block indent
  to 7 and any later 6-space line exited the block, corrupting the
  frontmatter. Observed in 5 of 13 Sonnet outputs on the helpbase self-
  dogfood — docs written to disk were unreadable by gray-matter, the MCP
  loader, and `helpbase audit`. Fix uses an explicit YAML indentation
  indicator (`|2-`) so the emitter's indent is authoritative regardless
  of content. Regression test round-trips a JSDoc snippet.
- **`context` discoverability in `helpbase --help`.** The flagship
  command was in the "Other" bucket below `completion` and `upgrade`.
  Promoted to "Most common" and leads "Get started."
- **Project name resolution for `llms.txt` and the LLM prompt.** The CLI
  used the directory basename when resolving the project name. Running
  `helpbase context /tmp/xyz123` told the LLM "You are documenting
  xyz123" even when `package.json` set `"name": "todo-app"`. New
  `resolveProjectName()` helper prefers `package.json` name, falls back
  to the basename. Used consistently for prompt + llms.txt.

### Changed
- **`helpbase context` citations are now disk-backed (v2 contract).** The
  LLM used to be asked for a verbatim `snippet` alongside each citation's
  file + line range; the validator then required that snippet to appear
  literally in the file. Dogfood on the helpbase repo itself exposed this
  as brittle: Gemini 3.1 Flash Lite (default model) dropped 3/3 docs and
  Sonnet 4.6 dropped 5 of 13 on paraphrase drift — models couldn't hold
  "verbatim bytes" reliably. The new contract asks the model only for
  `{file, startLine, endLine, reason}`; the CLI reads the literal bytes
  from disk after validation. Same repo, same model went from 0/3 → 3/3
  kept. `helpbaseContextVersion` bumps to `2`; v1 citations (with
  `snippet` fields) keep parsing and keep getting their literal-text
  check, so committed `.helpbase/` content is not invalidated. Schema
  synced to all four copies (apps/web, create-helpbase templates,
  shadcn registry, shared).
- **Sources section handles triple-backtick collisions.** When the disk
  bytes themselves contain ``` (any Markdown or MDX file picks this up),
  the fence widens to four or more backticks so the rendered doc stays
  parseable. Regression test covers it.

### Added
- **`--reuse-existing` flag on `helpbase context`.** With `--ask`, skips
  the walk + LLM generation and answers against the `.helpbase/docs/`
  already on disk. Unblocks the eval runner from N+1 full regenerations
  per run (one per question) down to a single generation, and gives
  users a fast path for asking repeat questions without re-spending
  tokens. Two new error codes guard misuse.
- **Eval quality gate ships in CI.** New `.github/workflows/context-eval.yml`
  runs the 5-question self-dogfood eval weekly (Mondays 09:00 UTC) plus
  on manual `workflow_dispatch`. Model is pinned to Sonnet 4.6 via
  `HELPBASE_EVAL_MODEL`; threshold is ≥ 0.70; eval-report.json uploads
  as an artifact with 90-day retention. Not per-PR — each run spends
  real LLM tokens.
- **Eval runner fixes.** Path resolution now anchors to the monorepo
  root (was: `packages/cli`), the `--max-tokens` cap is raised to 500k
  for large-repo runs, and the runner uses Sonnet for generation so the
  quality gate measures "is the pipeline good enough", not "does the
  cheapest model happen to work".
- **`helpbase context` — turn any repo into cited how-to docs + an MCP endpoint in one command.**
  Walks markdown + selected code extensions (TS, JS, Python, Go, Rust, Ruby,
  Java, Kotlin, Swift, PHP), synthesizes task-oriented how-to guides via
  Vercel AI Gateway, grounds every claim in a literal-text-validated citation
  (file + line range + verbatim snippet), writes MDX with a `## Sources`
  section to `.helpbase/docs/<category>/<slug>.mdx`, and emits
  `llms.txt` + `llms-full.txt` + an `mcp.json` config hint. Regeneration is
  idempotent: `source: generated` frontmatter marks files helpbase owns,
  `source: custom` is preserved untouched, stale generated files are
  deleted. Two safety gates (secret deny-list pre-walk + post-synthesis
  scan) abort runs before any file hits disk if secret-shaped content
  appears. `--ask "<question>"` runs a local RAG answer in the terminal
  against the freshly generated docs — no MCP client required for the
  first demo. `--require-clean` fails fast for CI; `--only <category>`
  regenerates a single category; `--max-tokens` enforces the input
  budget with a per-file breakdown when exceeded. Extends `generate` to
  accept a positional repo path (non-breaking alias for `--repo`).
- **Eval harness for `helpbase context`.** `packages/cli/eval/` ships 5
  questions × 1 repo (helpbase itself) with an LLM-as-judge grader.
  `pnpm --filter helpbase eval` runs the full pipeline and writes
  `eval-report.json`. ≥0.70 aggregate score is the ship-block. External
  repos + CI workflow_dispatch gate land in v1.1.
- **Shared citation + secret primitives.** `@workspace/shared/citations`
  (literal-text validator with CRLF normalization, path-traversal
  defense, per-run file cache) and `@workspace/shared/secrets` (deny-list
  for `.env*`, `*.pem`, `*.key`, `sk-*`, `AKIA*`, `ghp_`, `xoxb-`, AWS
  secrets, PEM blocks; matched bytes deliberately never appear in error
  output to prevent log leaks). Walker used by `generate --repo` now
  skips secret-named files too.
- **`frontmatterSchema` extension — `citations`, `source`,
  `helpbaseContextVersion` optional fields.** Propagated to all 4 copies
  via `pnpm sync:templates` so scaffolded apps and the shadcn registry
  validate generated content without failing. 
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
