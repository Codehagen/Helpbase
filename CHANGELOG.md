# Changelog

All notable changes to helpbase will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [helpbase 0.8.4] — 2026-04-23

One-command install for existing Next.js apps. Closes the "no MDX"
onboarding hole surfaced by a devex-review of the cold install flow:
a dev who saw the Shadcn reply, installed only the workflow, and had
no docs yet hit `E_NO_CONTENT` on first run with no good next step.
0.8.4 ships the branded install (`helpbase init`), a composed
registry primitive that lands routes + content + MCP + workflow in
one shadcn drop, and a friendlier error for anyone who still lands
on `E_NO_CONTENT`.

### Added — `helpbase init` (branded one-command install)

- **New `init` subcommand.** `pnpm dlx helpbase init` drops the full
  helpbase primitive into the current directory via the shadcn CLI.
  Thin wrapper — same files as running `shadcn add`
  `https://helpbase.dev/r/helpbase.json` directly, just with a
  brandable name for the Loom / tweet / docs.
- **Registry URL override via `HELPBASE_REGISTRY_URL`** or the
  `--url` flag, for staging / local / forked registries.
- **Package-manager aware**: picks `pnpm dlx` → `bunx` → `yarn dlx` →
  `npx` in priority order, same detection as `helpbase add`.

### Added — `helpbase` registry entry (Option B)

- **New composed primitive at `https://helpbase.dev/r/helpbase.json`.**
  Bundles the help-center block (35 files: routes, components, MDX
  pipeline, starter content), the MCP server (11 files), and the
  sync workflow (2 files) into a single 48-file shadcn drop. Every
  file also remains available as a standalone primitive at the same
  registry URLs (help-center, helpbase-mcp, helpbase-workflow) for
  piece-by-piece installs.

### Changed — E_NO_CONTENT error leads with `helpbase init`

- **First fix hint now points at `helpbase init`** for greenfield
  users. `--content <path>` and `HELPBASE_CONTENT_DIR` remain as
  second and third hints for users who already have docs in an
  uncommon layout. Shipped because a first-time install of just the
  workflow on a repo without docs was a dead-end otherwise — the
  previous hints both assumed docs exist.

### Homepage + docs

- **Landing-page CTA swapped to `pnpm dlx helpbase init`** (was
  `pnpm dlx create-helpbase`). `create-helpbase` remains available
  and is now linked from the new `/install` catalog page as the
  greenfield option.
- **New `/install` page** lists every primitive with install command,
  "when to use" blurb, and a link to the raw registry JSON for audit.

### Cold-verify evidence

- Built `apps/web/public/r/helpbase.json` (48 unique file targets,
  zero path collisions across the three source primitives).
- Ran `npx shadcn@latest add http://localhost:8765/helpbase.json` on
  a fresh Next.js 16 + turbopack + Tailwind app with
  `shadcn@latest init` already run. All 48 files landed; shadcn
  resolved the registry deps (button, badge, accordion, tabs) from
  `ui.shadcn.com` automatically. One skip: `components/ui/button.tsx`
  (identical to what `shadcn init` wrote, so `--overwrite=false`
  correctly declined).

## [helpbase 0.8.3] — 2026-04-23

Zero-config content-dir auto-discovery. Closes the "drop-in / works
with fumadocs" gap surfaced by a CEO-review of the v0.8.2 claims:
the MCP server already auto-walked three common layouts, but the sync
CLI defaulted to a single `"content"` path and errored on anything
else — so a fumadocs user who installed the workflow hit
`No MDX files found under content/` on first run.

### Fixed — `helpbase sync` works zero-config on fumadocs layouts

- **`--content` is no longer required.** When unset, sync walks up
  from the current working directory and picks the first match of:
  `apps/web/content/` (monorepo), `content/docs/` (MDX-in-subfolder,
  including fumadocs defaults), `content/` (flat). Mirrors the
  candidate order the MCP loader already uses
  (`packages/mcp/src/content/loader.ts`), so the MCP server and the
  sync CLI always pick the same directory.
- **Custom layouts still work the same way.** Pass `--content <path>`
  to override auto-discovery, or set `HELPBASE_CONTENT_DIR` in CI
  env. Both short-circuit the walk.

### Changed — shipped workflow YAML is now truly zero-config

- `registry/helpbase-workflow/helpbase-sync.yml` has not changed —
  it already omitted `--content`. What changed is that omitting it no
  longer errors on fumadocs/monorepo projects.
- Dogfood `.github/workflows/helpbase-sync.yml` dropped its
  `--content apps/web/content` override — the monorepo layout is
  auto-discovered.
- `registry/helpbase-workflow/README.md` Customize section rewritten
  to describe the three auto-discovered layouts.

### Added — unit test lockstep guard

- `packages/cli/test/content-dir.unit.test.ts`: 11 cases covering
  fallback order, preference (content/docs wins over content),
  cwd-walk-up, `HELPBASE_CONTENT_DIR` override (absolute + relative),
  and miss behavior. First assertion pins the candidate list so any
  future drift between CLI and MCP shows up as a failing test.

## [helpbase 0.8.2] — 2026-04-22

Second hotfix after a real-user end-to-end test on a fresh scratch
repo surfaced two more edge cases that would have hit every first-time
installer. Ships three fixes.

### Fixed — first-push on brand-new repos no longer crashes

- **`--since 0000...` (40-zero SHA) is now handled gracefully.** On a
  repo's very first push, GitHub's `github.event.before` is 40 zeros.
  git can't resolve that ("bad object") and sync previously exited 1.
  Fix: the rev-resolution regex now also catches `bad object` and
  `ambiguous argument` (the latter covers `HEAD~N` past history too).
  Under `--yes` (CI), these are treated as "brand-new repo, nothing
  to sync" — exit 0 with a note. Interactive users still see the
  targeted `E_INVALID_REV` error.

### Fixed — graceful fallback when Actions can't open PRs

- **The `Open PR` workflow step now survives the default-repo
  permission block.** GitHub Actions is not allowed to create pull
  requests by default (Settings → Actions → General → Workflow
  permissions). Previously every first-time user hit this as a hard
  failure even though the branch push succeeded.
- **New behavior:** branch push succeeds, then `gh pr create` is
  attempted. If GitHub returns "not permitted" or "Resource not
  accessible", the workflow emits a `::warning::` pointing at both
  the branch URL (manual PR-creation fallback) and the Settings URL
  (one-time permission enable), and exits 0. Any other PR-create
  failure still hard-fails.
- **`--base main` was hardcoded; now uses `${GITHUB_REF_NAME}`** so
  the workflow works on repos whose default branch is `master`,
  `trunk`, etc.

### Added — one-time setup section in registry README

- Explicit "One-time setup" section in
  `registry/helpbase-workflow/README.md` documents the Actions
  permission enable, both via Settings UI and via `gh api`. Users who
  flip it see auto-opened PRs; users who don't still get the branch
  pushed with a graceful warning pointing at the manual PR URL.

### Added — regression tests

- `cli.integration.test.ts`:
  - `--yes --since 0000...` on empty repo → exit 0, stdout contains
    "Git could not resolve... nothing to sync"
  - `--since HEAD~99` (interactive) → exit 1 + E_INVALID_REV

### Cold-verify evidence

Three-run test in a fresh Codehagen/helpbase-oidc-verify-v081-* repo:
  Run 1 (first push, 40-zero SHA): ❌ expected failure, fixed in 0.8.2
  Run 2 (second push, real diff, PR perm disabled): ❌ LLM generated
         perfect proposal with citations (lib/pricing.ts:1-4), branch
         pushed, PR-create blocked by org permission. Fixed in 0.8.2.
  Run 3 (third push, permission enabled): ✅ full green, PR #1 opened
         with the LLM-generated docs update.

## [helpbase 0.8.1] — 2026-04-22

Hotfix for two bugs caught by cold end-to-end verify against a fresh
GitHub repo using v0.8.0's OIDC lane. Both would have broken the first
install every user does from the Shadcn reply.

### Fixed — helpbase-workflow first-run reliability

- **`--since origin/main` on push-to-main was always empty.** The shipped
  v0.8.0 YAML hardcoded `--since origin/main`, but `actions/checkout@v4`
  makes `origin/main === HEAD` on push events, so the diff was empty
  every time. Swapped to `${{ github.event.before || 'HEAD~1' }}` — uses
  the prior commit SHA from the push payload, falls back to `HEAD~1` for
  schedule / workflow_dispatch.
- **`helpbase sync` exited 1 on empty diff even under `--yes`.** A
  scheduled cron run with no recent commits would fail the GitHub
  Action red. Now exits 0 with a one-line "nothing to sync" message
  (via `emit()` so CI logs see it, not gated by `canDecorate()`).
  Interactive users still see the full `E_NO_HISTORY` error with fix
  hints — they probably typo'd their `--since` arg.
- **Registry README Customize section rewritten** to reflect that
  base-branch customization no longer requires touching the `--since`
  line.

### Added — regression tests

- `cli.integration.test.ts` grew two cases covering the `--yes` → exit
  0 path and the interactive `--since HEAD` on an empty-diff repo →
  exit 1 + E_NO_HISTORY path.

### Known edge case (v0.8.2 target)

- First-ever push to a brand-new repo: `github.event.before` is 40
  zeros, which fails to resolve in git. Workflow exits 1 via
  E_INVALID_REV. Rare in practice (users installing helpbase-workflow
  typically have existing repos), but worth catching under `--yes` in
  the next patch.

## [helpbase 0.8.0] — 2026-04-22

Three things Shadcn asked for, all shipped in one release.

### Added — zero-config CI via GitHub Actions OIDC

- **`helpbase-workflow` v2 needs no secrets.** `shadcn add
  https://helpbase.dev/r/helpbase-workflow.json` + `git push` is the full
  setup. The workflow requests a GitHub-signed JSON Web Token scoped to
  `https://helpbase.dev` via `actions/get-id-token`, the helpbase
  backend verifies it against GitHub's public JWKS, and allocates
  per-repo quota keyed on the `repository_id` claim (stable across
  renames + org transfers). 500k tokens/day free tier. No
  `HELPBASE_TOKEN` secret, no `jq` extraction, no paste-and-pray.
- **New CLI env var `HELPBASE_CI_TOKEN`.** The workflow sets it from the
  OIDC step output and `helpbase sync` passes it as the Bearer to the
  hosted LLM proxy. Priority order is now: BYOK (`ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY` / `AI_GATEWAY_API_KEY`) → `HELPBASE_CI_TOKEN` →
  logged-in session → device-flow prompt.
- **Fork-PR defense.** GitHub's default is not to mint OIDC tokens for
  fork PRs, but the backend verifier rejects defensively if one
  somehow arrives (audience + signature + `event_name` check). Belt
  and suspenders for zero cost.
- **BYOK escape hatch preserved.** If you'd rather run on your own
  provider key, set the corresponding `secrets.FOO` and the CLI skips
  the helpbase proxy entirely. Your provider, your bill, your choice.

### Added — skills server (v1 prototype)

- **New MCP tools: `list_skills` + `get_skill`.** Agents can pull
  writing-style, tone, or formatting rules from
  `.helpbase/skills/<name>.md` at your repo root. Docs team edits
  markdown in git; other teams' agents consume over MCP. Answers
  Shadcn's third ask verbatim: "enforcing tone, writing styles...
  editable by the docs team... pulled by other teams."
- **Empty-list is not an error.** Repos without `.helpbase/skills/`
  see a helpful get-started message from `list_skills` and an
  available-names hint from `get_skill`. The surface is opt-in.
- **`HELPBASE_SKILLS_DIR` env var override** for non-standard layouts.
  Otherwise walks up from cwd finding `.helpbase/skills/`.
- **Draft RFC** for the skills-server design lives in a GitHub
  Discussion (link once published): naming, scope, multi-skill files,
  federation, versioning, v2 roadmap. Feedback welcome before we add
  ceremony the prototype can avoid.

### Added — MDX-in-subfolder content layout

- **`content/docs/` added to the MCP loader fallback.** `shadcn add
  helpbase-mcp` on a repo that keeps MDX under `content/docs/` (a common
  convention for docs alongside blog, changelog, etc.) now works
  zero-config. Resolution order: `HELPBASE_CONTENT_DIR` env → walk up
  looking for `apps/web/content/` → `content/docs/` → `content/`. More
  specific wins when a repo has both (`content/` often holds non-doc
  assets).

### Changed — web / `/api/v1/llm/*` auth dispatcher

- **Two-lane auth on one endpoint.** `withAuthAndQuota` now peeks at
  the Bearer token's `iss` claim (no crypto) and routes to either the
  existing Better Auth session lane (CLI users) or the new OIDC CI
  lane (workflow runs). CLI users see zero change. Hosted-tier
  behavior preserved.
- **New per-repo quota table `llm_usage_events_ci`.** Parallel to
  `llm_usage_events` (user-keyed). Global 10M/day cap stays shared
  across both lanes. New RPC `get_repo_tokens_today(p_repo_id)`
  mirrors `get_user_tokens_today` shape.
- **New wire error codes:** `oidc_invalid`, `oidc_wrong_audience`,
  `ci_quota_exceeded`. Each message points at the exact workflow fix
  (e.g. "Update the audience in your workflow's id-token step").

### Fixed — web / proxy pass-through for `/r/*.json`

- **`shadcn add https://helpbase.dev/r/*.json` no longer 406s.** The
  article-content-negotiation branch in `proxy.ts` treated every
  2-segment path as an article, so shadcn CLI's `Accept:
  application/json` tripped a 406. Registry JSON paths now
  fall through to the static file handler unchanged. Three regression
  tests guard the pass-through.

### Added — marketing / Made with shadcn positioning

- **Hero + footer lead with Shadcn's framing.** "Code in your repo,
  generated but editable." Single source of truth in
  `apps/web/lib/tagline.ts` with a CI-gated test so drift between
  hero / footer / README fails the build. Footer ships a "Made with
  shadcn" badge linking to `ui.shadcn.com`.

### Added — Accept: text/markdown on apex — 2026-04-21

- **AI agents can now fetch any helpbase.dev docs page as raw markdown.**
  Send `Accept: text/markdown` to an article URL and helpbase returns the
  page body as markdown with a `# Title` heading and description prepended.
  No SDK, no API key, no bespoke endpoint. The open web already had the
  mechanism; we just honor it. Third leg of the AI-consumption stool
  alongside `llms.txt` and the hosted MCP server.
- **Explicit `.md` URLs.** A crawler can also hit
  `helpbase.dev/getting-started/introduction.md` and get the same response,
  no Accept header needed. Useful for pipelines that don't thread request
  headers cleanly.
- **RFC 9110 compliant parser.** The specificity gotcha (`text/html;q=0,
  */*;q=1` must reject HTML even though the wildcard has higher q) is
  tested and handled. 17 parser tests, all green.
- **`Vary: Accept` at the edge.** Added to the Vercel routes manifest on
  `/:category/:slug` so CDNs split the cache correctly between HTML and
  markdown representations.
- **406 Not Acceptable** for truly impossible Accept headers (e.g.
  `application/pdf` on an article), scoped to 2-segment article paths only
  so non-article pages (`/docs`, `/waitlist`) never 406.

### Added — web / marketing page v2 — 2026-04-19

- **New marketing page at `/`.** Terminal-hero with `pnpm dlx create-helpbase`
  typing into a shadcn-framed Terminal (via `@magicui/terminal`), click-to-copy
  primary CTA, `See the live demo →` secondary CTA. Announces OSS + live today.
- **Dual-front comparator.** A vertical table compares Helpbase against two
  real status-quos side by side: rolling your own Next.js help center vs. a
  hosted docs SaaS. Checks the ownership, MCP, llms.txt, cost, and "maintained
  without you" rows.
- **How-it-works strip.** Scaffold → Preview → Deploy, 3 steps with
  illustrations, mapped to the real CLI flow.
- **AI-native bento.** Five-cell grid explaining the MCP server, llms.txt,
  structured agent output, `helpbase sync` (code-grounded doc diffs), and the
  hosted tier escape hatch.
- **Demo cross-link.** A section that points visitors at `demo.helpbase.dev`
  with a `curl /llms.txt` teaser of the structured agent output.
- **Pricing — open-core, three tiers.** Self-host (free, MIT), Hosted free
  (one site on `{slug}.helpbase.dev`, hosted MCP included), and Hosted Pro
  (coming soon — custom domain, team roles, analytics, priority support).
- **Grouped FAQ.** General / Hosted tier / MCP & AI, 9 questions covering OSS
  vs hosted, ownership, MCP, and migration.
- **Real footer.** GitHub, Docs, Pricing, Privacy, newsletter form. Named the
  built-on stack in the copyright line.

### Added — web / analytics

- **Supabase-native page analytics.** New `public.marketing_events` table
  (insert-only for anon via RLS, service-role read only). New `track` edge
  function validates an event allowlist, caps metadata at 2 KB, and derives a
  session hash as `sha256(ip|ua|yyyy-mm-dd)` without storing raw PII.
- **Client helper `apps/web/lib/analytics.ts`.** `track(event, metadata)` uses
  `keepalive: true` fetch and swallows every failure so analytics can never
  break the page.

### Added — `@workspace/ui`

- **`CopyButton` primitive.** Wraps the button with `navigator.clipboard`
  plus an `execCommand("copy")` fallback for older Safari / non-secure
  contexts. Exposes an `onCopy` callback and a `data-copy-state` attribute
  (`idle` / `copied` / `error`) for consumers.

### Changed — web / header

- **Killed placeholder nav.** The shadcn template left behind ten fake links
  (`Automation`, `Scalability`, `Marketplace`, `Guides`, `Partnerships`, etc.)
  and a `Continue` button pointing nowhere. Replaced with real helpbase nav:
  Docs, Pricing (anchor), GitHub. Right-side: `Sign in` + `Deploy now`.

### Security

- **`cf-connecting-ip` precedence in edge analytics.** The `track` function
  now prefers Cloudflare's authoritative IP header over the client-spoofable
  `x-forwarded-for`, closing a trivial session-hash forgery.
- **Scoped Cloudinary allowlist in `next.config.mjs`.** Added pathname
  constraint `/dohqjvu9k/**` so arbitrary Cloudinary content cannot be
  proxied through `/_next/image`.

### For contributors

- **Shadcn add, from `apps/web`.** Registry lives in
  `apps/web/components.json`, not the repo root. Document in your workflow:
  `cd apps/web && pnpm dlx shadcn@latest add @tailark-pro/...`.
- **Test coverage + 26.** Net-new tests: `apps/web/test/analytics.test.ts`
  (7), `apps/web/test/copy-button.test.tsx` (8), and
  `apps/web/test/track-edge-handler.test.ts` (12). Handler refactored out of
  the Deno `Deno.serve` entry so vitest can exercise it directly.

## [create-helpbase 0.5.0] — 2026-04-19

### Changed
- **Login prompt now fires at step 1, before content-source selection.** The
  previous design gated login on `source.kind !== "skip"`, so users who
  picked Skip walked through the whole scaffolder without ever being asked
  to claim a subdomain — a 100% funnel leak on that path. Login now runs
  right after project-name validation on every cold scaffold. Users who
  already have a session or `HELPBASE_TOKEN` skip the prompt silently.
- **Reframed the prompt copy as a perk, not a gate.** Was: "Log in to
  helpbase free? (500k tokens/day, no card — 30s browser flow)". Now:
  "Claim your free docs URL? (docs-<hex>.helpbase.dev + 500k AI tokens/day,
  no card)". Leading with the concrete subdomain URL converts better than
  the abstract "sign in" ask.
- **BYOK users also see the login prompt.** Previously skipped entirely
  when `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `AI_GATEWAY_API_KEY` was
  set. The subdomain reservation is orthogonal to AI credentials; BYOK
  users still benefit from a reserved deploy target.
- **"What next" block adapts to auth state.** Declined-login users now
  see `npx helpbase login` as the first line of the end-of-scaffold
  next-steps block; logged-in users don't see the redundant hint.

## [create-helpbase 0.4.0] — 2026-04-18

### Added
- **Ship-it-now prompt at end of scaffold.** After `create-helpbase` finishes
  scaffolding + generating articles + installing deps, the CLI now asks
  "Ship it now?" with Y as the default. On Y it runs `helpbase login` (if
  needed) and `helpbase deploy` inline, then prints the live URL and MCP
  config block — cold TTHW from `pnpm dlx create-helpbase` to a public help
  center collapses from ~3 min (scaffold → cd → login → deploy) to ~90s.
  Declining falls through to today's "Run it locally" + auto-dev-server flow,
  byte-for-byte. Skipped when the user picked sample content, when AI
  generation failed, or when stdin is not a TTY.
- **`--deploy` / `--no-deploy` flags** for non-interactive control. `--deploy`
  skips the prompt and assumes Y (CI-friendly ship with `HELPBASE_TOKEN`
  set). `--no-deploy` skips the prompt and keeps today's scaffold-only
  behavior. Neither flag is needed for the common interactive path.

## [helpbase 0.6.0] — 2026-04-18

### Added
- **`helpbase deploy --preview` shows what would change before shipping.** The CLI
  reads your local `content/`, fetches a metadata-only snapshot of the deployed
  tenant, and renders a color-coded preview table (added in green, updated in
  yellow, removed in red — articles AND categories). Flag exits 0 without
  touching the server. Works on the first-ever deploy too: fresh reservation
  shows "all N new locally" without creating the tenant row until you confirm.
  Pair with `--yes` for CI previews.
- **Smart-prompt on destructive deploys.** `helpbase deploy` now prints a
  one-line summary ("Publishing 3 updated, 1 new") and deploys silently on
  routine add/update flows. When the diff contains destructive changes
  (article removals, category deletions), the CLI pauses and shows the full
  preview table before asking y/n. Matches the helm/kubectl/vercel convention
  of silent-on-routine, prompt-on-destructive. Non-interactive mode
  (`HELPBASE_TOKEN` set) preserves the current CI behavior — no state fetch,
  no prompt.
- **Auto-retry on concurrent deploys.** If another client ships between your
  preview fetch and your confirm, the CLI automatically refetches `/state`,
  re-renders the diff, and reprompts inline. Capped at one retry to prevent
  runaway contention loops. If the concurrent deploy already shipped the
  content you were about to ship, the CLI reports "Remote now matches your
  local content" and exits 0 (correct no-op, not a failure).
- **`GET /api/v1/tenants/:id/state` endpoint.** Returns the full deployed
  snapshot (articles with content hashes, categories, deploy_version) so
  clients can diff locally without pulling full article bodies. Marked
  `force-dynamic` to prevent Vercel ISR from serving stale snapshots that
  would make previews lie.

### Changed
- **`deploy_tenant` RPC now returns `{deploy_id, new_deploy_version}`.** Row
  is locked `FOR UPDATE` for the duration of the transaction. Accepts an
  optional `p_expected_deploy_version` for optimistic concurrency; mismatch
  raises `stale_deploy_version` (SQLSTATE P0001) and the web route translates
  that to HTTP 409 with the current version in the body. The CLI surfaces
  this as a typed `PreviewStaleError` so the retry path can catch it
  specifically.
- **Deploy route re-reads tenant slug post-RPC** so a concurrent
  reservation rename between `requireOwnedTenant()` and the deploy RPC
  doesn't cause the response and `revalidatePath()` to point at a stale
  subdomain.
- **`tenant_articles` gained a `content_hash` column** (SHA-256 of
  title + description + sorted-key frontmatter JSON + content, exact bytes,
  no whitespace normalization). Same algorithm runs client-side in
  `@workspace/shared/article-hash` and server-side when the deploy RPC
  writes the row. Pre-v2 rows default to empty string and re-hash on the
  next deploy.
- **`tenants` gained a `deploy_version` column** (monotonic counter,
  bigint, NOT NULL DEFAULT 0) to back the optimistic concurrency path.
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
- **`/api/v1/tenants/mine` hides reservations.** Reservations are
  pre-first-deploy placeholders and shouldn't pollute the tenant
  picker for multi-tenant users. The new filter is
  `.not("deployed_at", "is", null)`. Callers that specifically want
  the reservation (login, whoami, open) hit
  `GET /api/v1/tenants/reservation` instead.
- **`tenants_public` view now exposes `deployed_at`.** The subdomain
  middleware needs this to distinguish reserved tenants from live
  ones without granting anon read access to the full tenants table.
  `mcp_public_token` still never appears in the view.

### Fixed
- **Local validation runs before auth so empty-folder errors match the real
  problem.** Running `helpbase deploy` in a directory without `content/`
  previously showed "Not signed in" (because auth ran before the existence
  check). Now shows "No content/ directory found. Run npx create-helpbase"
  first. Same ordering for bad frontmatter — Zod errors surface before
  auth, so the user sees the actual blocker.

- **`helpbase login` reserves a subdomain instantly.** After successful
  authentication, the CLI calls `POST /api/v1/tenants/auto-provision`
  which mints a product-neutral `docs-<6hex>.helpbase.dev` reservation
  for the caller. The reserved URL prints in the login outro so users
  see a concrete destination before they've written a single article.
  TTHW for the first-deploy happy path drops from ~3-4 min (slug
  prompt + confirmation) to ~90s (login + deploy, zero prompts). If
  the auto-provision call 503s, login still succeeds — the reservation
  is best-effort, and `helpbase whoami` / `helpbase deploy` both lazy-
  provision as a fallback for users who were logged in before this
  feature existed or who Ctrl-C'd between session save and the first
  auto-provision call.
- **New command: `helpbase rename <new-slug>`.** Pre-deploy slug rename
  for the auto-provisioned reservation. Server gates on `deployed_at
  IS NULL`, so post-deploy renames are cleanly rejected with
  `E_RESERVATION_LOCKED`. Update + local cache write is atomic from
  the user's perspective; subsequent `whoami` reflects the new slug
  without an extra round-trip.
- **Branded "coming soon" landing page** at reserved-tenant subdomains.
  Reserved tenants now render a helpbase-branded placeholder at `/`
  explaining that the help center hasn't been published yet, and
  return 404 for every other path so article deep-links don't leak
  the empty category grid. Every reserved-tenant response carries
  `X-Robots-Tag: noindex, nofollow` so Google doesn't index `docs-*.
  helpbase.dev` placeholders.
- **`helpbase whoami` surfaces the reservation.** Users with no
  deployed tenants but an active reservation see a `reserved:
  <slug>.helpbase.dev` line and a hint to run `helpbase deploy` or
  `helpbase rename`. `helpbase open` falls back to the reservation
  URL when no deployed tenant exists.
- **`deploy_tenant` RPC flips `deployed_at` atomically.** First publish
  transitions a reservation to "live" inside the same transaction as
  the content INSERT, so the reservation-vs-deployed boundary is
  never racy. `COALESCE` preserves the ORIGINAL `deployed_at` on
  re-deploys — per-deploy history continues to live in
  `tenant_deploys.created_at`.
- **Vercel Cron: `/api/cron/cleanup-reservations`.** Nightly (03:00
  UTC) job that prunes reservations older than 30 days that never
  deployed. Guarded by a `NOT EXISTS (SELECT 1 FROM tenant_deploys
  WHERE tenant_id = tenants.id)` predicate so a row with ghost
  deploy history can never be deleted even if `deployed_at` somehow
  failed to update. Supports `?dry=true` for a no-op count. Bearer
  auth via `CRON_SECRET` env var.
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

### Schema
- New columns on `public.tenants`: `deployed_at timestamptz` +
  `auto_provisioned_at timestamptz` (both nullable). Backfilled
  existing rows with `deployed_at = created_at`.
- New UNIQUE partial index `idx_tenants_owner_one_reservation`
  on `owner_id WHERE auto_provisioned_at IS NOT NULL AND
  deployed_at IS NULL` — race-safe idempotency for the
  auto-provision endpoint.
- New lookup index `idx_tenants_owner_auto_provisioned` on the same
  partial predicate minus the `deployed_at` clause — small and
  sargable for the reservation lookup path.
- Migration: `slug_reservation_columns_and_first_deploy_timestamp`.

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
