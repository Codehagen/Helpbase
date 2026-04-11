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

### TODO-008: Add link checker to `helpbase audit`

**What:** `helpbase audit` validates frontmatter but doesn't check internal links, anchor references, or external URLs in article content. Broken links in MDX content ship silently.

**Why:** Hand-authored MDX articles contain links to other articles, GitHub URLs, and anchor references. Without validation, link rot accumulates. The Edit on GitHub links also need verification (correct file paths).

**Pros:** Catches broken links before deploy. Completes the audit surface.
**Cons:** External URL checking adds network calls and latency. Could be opt-in.

**Context:**
- File: `packages/cli/src/audit.ts`
- Current audit checks: frontmatter validation, category metadata, empty categories
- New checks needed: internal link targets exist, anchor targets exist in target articles, external URLs return 200 (opt-in flag)
- Could also validate `<Card href="...">` and `<CtaCard href="...">` props

**Effort:** S (human ~2 hr / CC ~15 min)
**Priority:** P3
**Depends on:** None
**Source:** /plan-ceo-review 2026-04-11, surfaced by Codex outside voice

---

## Completed

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
