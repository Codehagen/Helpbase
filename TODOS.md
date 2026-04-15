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

## P2

_All P2 items shipped on 2026-04-09. See the Completed section._

## P3

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

### TODO-007: Implement `helpbase generate --repo` for GitHub source ingestion

**What:** The `--repo` flag is declared in the generate CLI but exits with "Repository-based generation is not yet implemented." Currently `--url` only scrapes rendered HTML pages, which doesn't work well for GitHub repo pages (scrapes the HTML shell, not the content).

**Why:** Developers want to generate help center articles from their GitHub README and source files. The current workaround (pointing `--url` at rendered docs pages) misses repo-only content like code examples, API docs, and architecture docs.

**Pros:** Enables the primary dogfooding workflow. Completes the CLI surface area.
**Cons:** Requires GitHub API integration or raw content fetching. Token management for private repos.

**Context:**
- File: `packages/cli/src/commands/generate.ts` line 30 (the `--repo` flag declaration)
- The exit-with-error is on the same file, inside the generate command handler
- Approach: Use GitHub Contents API to fetch README.md and other markdown files, then feed to the existing generation pipeline
- Could also support local repo paths: `helpbase generate --repo .` reads files from disk

**Effort:** M (human ~1 week / CC ~30 min)
**Priority:** P2
**Depends on:** None
**Source:** /plan-ceo-review 2026-04-11, surfaced by Codex outside voice

---

---

### TODO-009: Codebase-grounded doc sync (AI proposes doc diffs from code changes)

**What:** `helpbase sync` CLI command that diffs code since last sync, calls an LLM with code context + existing MDX docs, proposes doc updates as a reviewable diff. Explicitly NOT "AI writes docs from a prompt" — all proposed changes grounded in actual source.

**Why:** Third priority in the 2026-04-15 strategy design doc. Matches the "reliable, continuously updated" knowledge-layer pitch without introducing hallucinated content. Deferred from the MCP/llms.txt PR to keep scope tight.

**Pros:** Closes the "docs stay in sync with code" gap that competitors monetize. Reinforces the code-owned stance (sync is a tool you run, not a service that runs on you).
**Cons:** Needs LLM provider abstraction, diff review UX, and git integration. Bigger design surface than MCP.

**Context:**
- Strategy doc: `~/.gstack/projects/help-center/christer-main-design-20260415-strategy-mintlify.md`
- Natural home: new command in `packages/cli/src/commands/sync.ts`
- Dependencies: existing generation pipeline in `packages/cli` + `packages/shared/src/ai-text.ts`
- Run its own `/plan-eng-review` before implementation

**Effort:** L (human ~2 weeks / CC ~2h)
**Priority:** P2 (next-up after MCP lands)
**Depends on:** MCP + llms.txt PR merged (so all three pillars of the strategy land in the right order)
**Source:** Strategy design doc 2026-04-15, /plan-eng-review 2026-04-15

---

### TODO-010: HTTP / Streamable transport for `@helpbase/mcp` (v2)

**What:** Add the `StreamableHTTPServerTransport` option to the MCP server, plus auth (token-based), CORS config, and deployment docs. Enables remote AI agents to query a helpbase instance over HTTP without spawning a subprocess.

**Why:** Stdio covers Claude Desktop, Cursor, Zed — the current high-leverage clients. HTTP is needed for: (a) hosted tier exposing an MCP endpoint automatically per customer, (b) serverless/edge agent deployments, (c) internal agents running separately from the doc content.

**Pros:** Unlocks hosted-tier MCP exposure and remote agent use cases. Fills the v2 feature parity gap.
**Cons:** Doubles test surface. Introduces auth decisions (API key? JWT? shadcn registry item shouldn't bake in a specific auth model). Requires deployment examples (Fly, Vercel, self-host).

**Context:**
- SDK support: `@modelcontextprotocol/sdk` exposes `StreamableHTTPServerTransport`
- v1 MCP package structures `server.ts` transport-agnostic so this is additive, not a rewrite (decision 2A/2C from /plan-eng-review 2026-04-15)
- Hosted-tier design doc (2026-04-11) may inform auth choices — check before landing

**Effort:** M (human ~1 week / CC ~1h)
**Priority:** P3
**Depends on:** v1 MCP package (TODO-009 not required). Hosted-tier design direction finalized.
**Source:** /plan-eng-review 2026-04-15, deferred from MCP v1 scope

---

### TODO-011: Semantic search inside MCP `search_docs` tool

**What:** Upgrade `search_docs` from keyword/title match to embeddings-based semantic search. Adds a local embedding index built at `pnpm build` time (or on first MCP server start), stored alongside content.

**Why:** Keyword match in v1 misses paraphrased queries. An agent asking "how do I authenticate my requests" should find `/guides/api-keys.mdx` even if "authenticate" isn't in the title. Semantic search closes that gap.

**Pros:** Materially better search quality. Makes the MCP tool feel intelligent rather than grep-y. Still fully local (no external service).
**Cons:** Adds an embeddings dependency and a local vector store. Model selection decision (ONNX local vs. API). Increases package size.

**Context:**
- Start with a small local model (e.g., minilm via `@xenova/transformers` or similar) to keep zero-network-at-runtime guarantee
- Index file lives in `apps/web/public/search-index.bin` alongside `llms.txt`
- Search tool prefers semantic, falls back to keyword if index missing

**Effort:** M (human ~4-5 days / CC ~1h)
**Priority:** P3
**Depends on:** v1 MCP shipped and in use (need query data to know what fails)
**Source:** /plan-eng-review 2026-04-15, deferred from MCP v1 scope

---

### TODO-013: Wire `generate-llms.mjs` into customer templates

**What:** Copy `apps/web/scripts/generate-llms.mjs` into the scaffolder templates (via `scripts/sync-templates.mjs`) and add the `generate:llms` script to the template's `package.json`. Parameterize `SITE_URL` so customer scaffolds default to `__HELPBASE_SITE_URL__` (or read from their `DESIGN.md` / env) instead of hardcoded `https://helpbase.dev`.

**Why:** Shipped in the v1 MCP/llms PR, but only wired into the helpbase.dev monorepo. Customers who scaffold a new help center don't get `llms.txt` generation yet. The code-ownership story ("your knowledge layer, your repo") is incomplete until every scaffolded project emits llms.txt by default.

**Pros:** Completes the llms.txt story for customers. Every helpbase install contributes to the open knowledge-layer positioning.
**Cons:** Need to decide how `SITE_URL` gets set on customer templates (env var in `.env.local`? placeholder in `__HELPBASE_SITE_URL__` replacement?).

**Context:**
- Source: `apps/web/scripts/generate-llms.mjs` — copy as-is with `SITE_URL` parameterized
- Integration point: `scripts/sync-templates.mjs:440` (`generateTemplatesPackageJson`) — add `"generate:llms": "node scripts/generate-llms.mjs"` and wire into `prebuild` in the template's package.json
- Smoke test: extend `scripts/smoke-install.sh` to assert both `public/llms.txt` and `public/llms-full.txt` exist after scaffold + build

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P2 (ship soon after v1 MCP lands)
**Depends on:** v1 MCP/llms PR merged
**Source:** /review 2026-04-15

---

### TODO-012: Pre-publish check — claim `@helpbase` npm scope

**What:** Before first publish of `@helpbase/mcp`, verify the `@helpbase` scope is available on npm and claim it. Publish an empty placeholder if needed to prevent squatting.

**Why:** The architecture decision (2026-04-15) committed to `@helpbase/mcp` and a scope-based family naming strategy. Losing the scope to a squatter kills the naming plan and forces rebranding.

**Pros:** Claims the naming space. Cheap insurance.
**Cons:** Need an npm org and 2FA. Minor publish ceremony.

**Context:**
- Run: `npm access list packages @helpbase 2>&1` — 404 means available
- If available: create npm org, publish placeholder `@helpbase/placeholder` (or similar) with a README pointing at helpbase.dev
- If taken: evaluate alternatives (`@helpbasedev`, `helpbase-mcp` unscoped, etc.) — revise design

**Effort:** S (human ~30 min / CC ~5min)
**Priority:** P1 (do before first MCP PR lands)
**Depends on:** None
**Source:** /plan-eng-review 2026-04-15

---

## Completed

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
