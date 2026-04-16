# TODOS

Living list of deferred work surfaced by reviews. Items here have been
considered, judged worth doing, and explicitly deferred from the PR or
review they came from. Sorted by priority then by ticket order.

## Format

Each item:
- **What:** one-line description
- **Why:** the concrete problem it solves or value it unlocks
- **Pros / Cons:** what you gain / what it costs
- **Context:** enough detail that someone picking this up in 3 months knows where to start
- **Effort:** S / M / L / XL (with CC: usually one tier lower)
- **Priority:** P1 (blocks launch) / P2 (next-up) / P3 (nice to have)
- **Depends on / blocked by:** prerequisites or ordering constraints
- **Source:** which review or session surfaced it

---

## P1

_All P1 items for the 2026-04-15 knowledge-layer plan shipped. See Completed._

## P2

_All P2 items for the 2026-04-15 knowledge-layer plan shipped. See Completed._

## P3 (deferred)

### TODO-017: `helpbase agent` — prompt-to-PR doc writer (deferred)

**What:** CLI that takes a natural-language prompt and opens a doc PR. Parity with hosted-docs-SaaS prompt-to-PR features, but invokable from any CI or locally. No GitHub App phone-home.

**Why:** Completes the prompt-to-PR capability as code-you-own. Ship AFTER `helpbase sync` has validated the citation-grounding approach in production — agent is the higher-hallucination surface.

**Pros:** Closes the last major capability gap versus hosted docs SaaS.
**Cons:** Freeform AI doc writing is the highest hallucination risk. Not shippable until sync has proven the grounding UX works.

**Context:**
- Plan: `~/.claude/plans/mellow-pondering-wilkes.md` (P3 item 7)
- Deferred date: 2026-05-31 (reassess after P1 + P2 have shipped)
- Builds on TODO-009 (sync) + TODO-010 (HTTP MCP)
- Consider exposing as `helpbase agent "update the auth docs for the new OAuth flow"` → PR

**Effort:** L (human ~2 weeks / CC ~2h)
**Priority:** P3
**Depends on:** TODO-009, TODO-010, plus real user feedback from sync
**Source:** /plan-ceo-review 2026-04-15

---

### TODO-004: Hero screenshot for README

**What:** Capture a hero screenshot or recording of the polished docs page (sidebar + TOC, light mode, 1600x840) and add it to the README under the badges block.

**Why:** Repos with hero images get more stars. The README literally has a TODO comment in place of the hero today.

**Pros:** Better launch surface. Higher conversion on GitHub visits.
**Cons:** Needs a deployed helpbase.dev to produce a real screenshot, OR a clean local dev server with sample content.

**Context:**
- File: `README.md` line 18 (the existing TODO comment)
- Save target: `apps/web/public/og.png`
- Recommended angle: docs page with sidebar populated + TOC visible on the right
- Would also become the OpenGraph image once helpbase.dev is deployed

**Effort:** S (human ~20 min / CC: not applicable — this is a manual screenshot)
**Priority:** P3
**Depends on:** Either scaffolder fix landed (for clean local screenshot) or helpbase.dev deployed
**Source:** Pre-existing TODO in README; surfaced in /plan-ceo-review 2026-04-09 system audit

---

## Completed

### TODO-011: Semantic search inside MCP `search_docs` tool
**Completed:** 2026-04-16 — `packages/mcp/src/content/semantic.ts` ships `buildSearchIndex` / `saveSearchIndex` / `loadSearchIndex` / `semanticSearch` / `cosineSimilarity` backed by `@xenova/transformers` (default model `Xenova/all-MiniLM-L6-v2`, 384-dim, quantized). `@xenova/transformers` is an **optional peer dep** (`peerDependenciesMeta.optional = true`) so the default install stays light; dynamic import with an install-hint error keeps keyword search working when the peer dep is absent. Custom `Embedder` injection keeps tests fully offline (no model download). New bin `helpbase-mcp-build-index` writes `.search-index.json` beside the content dir (configurable via `--content-dir` / `--output` / `--model` flags or `HELPBASE_SEARCH_INDEX` env). `buildServer` auto-loads the default index path, logs a stderr warning on stale docs, and wires the index into `handleSearchDocs` while advertising the upgraded tool description. 68/68 mcp tests green (19 new semantic tests covering cosine geometry, ranking correctness on auth/install/intro clusters, save/load round-trip, all malformed-index paths, keyword fallback). Existing `content/index.ts` renamed internal ranker to `keywordSearch`; exported `searchDocs` is now an async dispatcher. MCP package README documents the opt-in flow end to end.

### TODO-007: Implement `helpbase generate --repo` for local repo markdown
**Completed:** 2026-04-15 — `packages/shared/src/ai-text.ts` exports `readRepoContent(repoPath)` which walks a local directory, picks up `.md`/`.mdx`/`.markdown` files (skipping `node_modules`/`.git`/`dist`/`.next`/`build`/`out`/`.turbo`/`.vercel`/`.cache`/`coverage`/`.helpbase`), sorts README-like files first, concatenates with `===== <relpath> =====` headers, caps at 200k chars (shared `MAX_REPO_CONTENT_CHARS` / `MIN_SCRAPED_LENGTH`). `packages/cli/src/commands/generate.ts` wires `--repo` through the same article-plan pipeline as `--url` (supports `--debug`, `--dry-run`, `--test`, `--model`, `--output`). New `printRepoError` helper matches the existing problem/reason/fix/docs format. Generate test suite now covers missing-path, empty-dir, and dry-run-with-content paths; 305/305 CLI tests green + typecheck clean. GitHub URL ingestion (public `owner/repo` via Contents API) deferred — local paths cover the dogfooding flow and avoid token management for private repos.

### TODO-010: HTTP / Streamable transport for `@helpbase/mcp` (v2)
**Completed:** 2026-04-15 — `packages/mcp/src/http.ts` ships `StreamableHTTPServerTransport` with bearer token auth (`HELPBASE_MCP_TOKEN`) + CORS allowlist (`HELPBASE_MCP_ALLOWED_ORIGINS`) + `/health` endpoint + fail-fast on missing token. New binary `helpbase-mcp-http` ships in the package. New CLI subcommand `helpbase mcp start [--http]` wraps both transports via `npx -y --package @helpbase/mcp`. E_NO_MCP_TOKEN error code with docs page at `/errors/e-no-mcp-token`. 49/49 MCP tests green (19 new HTTP tests including live integration: 401 auth, CORS preflight, /health no-auth, 404 unknown paths, cross-origin rejection). Bearer NOT OAuth by design — OAuth would require an identity provider, breaking code-you-own stance.

### TODO-014: `helpbase-workflow` shadcn registry item
**Completed:** 2026-04-15 — `registry/helpbase-workflow/` ships a single `helpbase-sync.yml` that drops into `.github/workflows/` via `shadcn add helpbase-workflow`. Wired into `registry.json` + rebuilt `apps/web/public/r/helpbase-workflow.json`. The workflow runs `npx -y helpbase sync --apply --yes`, detects changes via `git status --porcelain`, creates a timestamped branch, and opens a PR via `gh pr create`. No separate GitHub Action repo to maintain — the YAML IS the primitive. Stance-pure: runs in the user's Actions minutes with their secrets. Passes `scripts/smoke-registry.sh`.

### TODO-015: `create-helpbase --internal` variant
**Completed:** 2026-04-15 — `packages/create-helpbase/internal-overlay/` holds handbook-style content seed (handbook/welcome.mdx, runbooks/on-call.mdx, decisions/adr-template.mdx) + auth-ready `.env.example` with `HELPBASE_MCP_TOKEN` / `HELPBASE_MCP_ALLOWED_ORIGINS` / `AI_GATEWAY_API_KEY` scaffolding. `scaffold.ts` applies the overlay after the base scaffold when `--internal` is passed, wiping the public-docs sample first. `scripts/smoke-install.sh --internal` asserts the handbook/runbooks/decisions routes + `.env.example` + `llms.txt` artifacts. Default smoke (no flag) still passes. One template, one example, same product — no separate product line.

### TODO-009: `helpbase sync` — codebase-grounded doc proposals
**Completed:** 2026-04-15 — `packages/shared/src/ai-sync.ts` + `packages/shared/src/schemas.ts` (SyncProposalSchema with mandatory citations) + `packages/cli/src/commands/sync.ts` (flags `--demo`, `--since`, `--content`, `--output`, `--model`, `--test`, `--dry-run`, `--apply`). Anti-hallucination gate proven by 200-mutation property test (`packages/cli/test/sync-schema.test.ts`). Bundled demo fixture at `packages/cli/fixtures/demo-repo/` delivers the 30-second magical moment (no API key, no config). Tier-2 error codes shipped: `E_NO_GH`, `E_NO_CITATIONS`, `E_NO_HISTORY`, `E_INVALID_REV`, `E_NO_CONTENT` with doc pages at `apps/web/app/(main)/errors/[code]/page.tsx`. 5-minute tutorial at `apps/web/content/guides/sync-in-5-minutes.mdx`. 303/303 CLI tests + 30/30 web tests green; smoke-install passes end-to-end with the new tutorial in the scaffolded output. Not in this PR: `--pr` gh integration (deferred), 10-fixture eval suite (P2 pre-prompt-change gate).

### TODO-016: Positioning lockdown — home hero + README + registry copy
**Completed:** 2026-04-15 — `apps/web/app/(main)/page.tsx` hero rewritten to "The AI-native knowledge layer, as code you own." `README.md` intro + Why section rewritten to stance-first framing with primitives list (MCP, llms.txt, sync, workflows). `registry.json` help-center description aligned. No competitor names in any shipped surface — confirmed by `grep -rn "[Mm]intlify"` returning zero hits across `apps/`, `packages/`, `registry/`, and top-level docs. Tests green across web + CLI packages.

### TODO-013: Wire `generate-llms.mjs` into customer templates
**Completed:** 2026-04-15 — `packages/create-helpbase/template-assets/generate-llms.mjs` is a parameterized variant (reads `HELPBASE_SITE_URL` / `HELPBASE_PROJECT_NAME` / `HELPBASE_SUMMARY` with package.json fallbacks, graceful MDX/frontmatter error recovery). `scripts/sync-templates.mjs` copies it via `copyTemplateAssets()`. Template `package.json` wires `predev` + `prebuild` + `generate:llms` scripts. `scripts/smoke-install.sh` now asserts both `public/llms.txt` and `public/llms-full.txt` exist after scaffold + build — smoke-install passes end-to-end.

### TODO-012: Claim `@helpbase` npm scope and ship v0.0.1
**Completed:** 2026-04-15 — `@helpbase` org created on npmjs.com (free tier, public packages). `@helpbase/mcp@0.0.1` published to the registry (17.3 kB tarball, 50.2 kB unpacked, 8 files). End-to-end verified: `HELPBASE_CONTENT_DIR=./docs npx -y @helpbase/mcp` spawns, handshakes MCP protocol, returns all three tools with valid schemas, keeps stdout clean of non-JSON-RPC. Scope-family naming reserved for future `@helpbase/cli`, `@helpbase/sync`, etc.

### TODO-008: Add link checker to `helpbase audit`
**Completed:** 416ff8d (2026-04-11) — internal link validation for markdown links and href props. Strips code blocks before checking, skips placeholder paths. Also fixed MDX component validation to strip code blocks (prevents false positives like `<ThemeProvider>` in examples). Fixed broken link in reference/card-group.mdx. 6 new tests.

### TODO-003: Dedup `registry/helpbase/lib/schemas.ts` against `packages/shared/src/schemas.ts`
**Completed:** 8bc8e5b + 2d7beb8 (2026-04-11) — the sync script (`scripts/sync-templates.mjs`) now generates both registry and template copies from `packages/shared/src/schemas.ts` via `inlineWorkspaceUtilitiesToRegistry()` and `inlineWorkspaceUtilitiesToTemplates()`. CI gate (`pnpm sync:templates && git diff --exit-code`) catches drift. Verified both copies are byte-identical.

### TODO-005: Drop unused @hugeicons deps from apps/web/package.json
**Completed:** 8088ce7 (2026-04-11) — removed `@hugeicons/core-free-icons` and `@hugeicons/react` from apps/web (never imported). Kept in packages/ui where dialog.tsx uses them.

### TODO-006: Zod version mismatch in workspace
**Completed:** 8088ce7 (2026-04-11) — removed dead `zod ^3.25.76` from packages/ui (never imported, grep confirmed). Workspace now has one zod version: `^4.3.6` in apps/web and packages/shared.

### TODO-001: Update README "What you get" tree to match the real templates output
**Completed:** bdefe1f (2026-04-09) — rewrote tree against the actual scaffolded output (37 files). Also fixed stale test count (87→94), stale license badge (MIT→AGPL-3.0), and extended the monorepo Project structure section with the new scripts/ directory and templates dir explanation.

### TODO-002: Prompt v0.0.3 — fix word floor + article count drift on markdown sources
**Completed:** 93a2de8 (2026-04-09) — tightened structure rule to require markdown ## H2 headings explicitly, added word-count self-check with source-density warning, expanded code-example trigger list, inlined banned marketing words into the title rule. Verified with four smoke runs on Gemini Flash Lite against vercel.com + resend.com: 8/8 articles hit 3+ headings (was 4/9 on v0.0.2), 8/8 hit 150+ words (was 1/9). Residual: 1-of-16 titles still contained "streamline" — baseline noise rate, not a rule failure.
