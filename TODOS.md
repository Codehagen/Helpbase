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

### TODO-003: Dedup `registry/helpbase/lib/schemas.ts` against `packages/shared/src/schemas.ts`

**What:** Two parallel copies of the article frontmatter / category metadata schemas exist. They are now out of sync after a recent comment update on `packages/shared/src/schemas.ts`.

**Why:** Schema drift is a silent-failure source. The shadcn registry consumers will eventually load a different schema than the helpbase package consumers, and the divergence will manifest as confusing build errors or rejected articles.

**Pros:** One source of truth. Eliminates a known drift vector.
**Cons:** Requires a build-time copy or generated-file pattern, similar to the templates sync work in the scaffolder fix. Could be combined with that effort.

**Context:**
- Files: `packages/shared/src/schemas.ts` (canonical) vs `registry/helpbase/lib/schemas.ts` (drift copy)
- The registry has its own copy because shadcn registry items must be self-contained — the consumer doesn't get workspace deps
- Possible fix: extend the same templates sync pattern from the scaffolder fix to also generate `registry/helpbase/lib/*` from `packages/shared/src/*`. One sync script, two outputs.

**Effort:** S (human ~30 min / CC ~10 min if combined with the templates sync work)
**Priority:** P3
**Depends on:** Scaffolder fix landed (the sync script pattern from that fix is the model)
**Source:** Pre-existing tech debt; surfaced again in /plan-ceo-review 2026-04-09 Step 0B

---

### TODO-005: Drop unused @hugeicons deps from apps/web/package.json

**What:** `apps/web/package.json` declares `@hugeicons/core-free-icons ^4.1.1` and `@hugeicons/react ^1.1.6` as dependencies, but neither is imported anywhere in apps/web source files. They were probably added speculatively.

**Why:** Inflates install size by ~80KB. More importantly, signals that the apps/web dep list isn't trustworthy, which makes the templates+sync work in TODO-002-adjacent territory more confusing for contributors.

**Pros:** Cleaner dep list. Smaller `pnpm install` size. One source of "actually used" deps that the scaffolder can mirror confidently.
**Cons:** None. Pure cleanup.

**Context:**
- Files: `apps/web/package.json` lines 15-16
- Verification: `grep -r "@hugeicons" apps/web/{app,components,lib} --include="*.tsx" --include="*.ts"` returns zero results
- After dropping: `pnpm install && pnpm --filter web build` should still pass
- Discovered during /plan-eng-review 2026-04-09 dependency inventory for the scaffolder fix

**Effort:** S (human ~5 min / CC ~2 min)
**Priority:** P3
**Depends on:** None
**Source:** /plan-eng-review 2026-04-09

---

### TODO-006: Zod version mismatch in workspace

**What:** `packages/ui/package.json` declares `zod ^3.25.76`. `packages/shared/package.json` and `apps/web/package.json` declare `zod ^4.3.6`. Pnpm's hoisting will pick one or the other unpredictably depending on resolution order.

**Why:** Real workspace inconsistency, not cosmetic. zod v3 and v4 have meaningful API differences (schema definition, error formatting, default value handling). If a Badge variant ever gets validated through `packages/ui`'s zod, the result depends on which version pnpm hoisted.

**Pros:** One zod across the workspace. Predictable behavior. Easier dep audits.
**Cons:** Need to verify the Badge component (the only zod consumer in `packages/ui`) still works after the bump. Probably trivial since Badge uses `class-variance-authority`, not zod directly — but worth verifying the package even imports zod for a real reason.

**Context:**
- Files: `packages/ui/package.json` line containing `zod`
- Bump target: `^4.3.6` to match the rest of the workspace
- Verification: `pnpm install && pnpm test && pnpm --filter web build`
- Investigation step before bumping: `grep -r "from \"zod\"" packages/ui/src` to see if zod is even imported by the ui package, or whether it's a leftover dep declaration
- Discovered during /plan-eng-review 2026-04-09

**Effort:** S (human ~10 min / CC ~5 min)
**Priority:** P2
**Depends on:** None
**Source:** /plan-eng-review 2026-04-09

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

### TODO-001: Update README "What you get" tree to match the real templates output
**Completed:** bdefe1f (2026-04-09) — rewrote tree against the actual scaffolded output (37 files). Also fixed stale test count (87→94), stale license badge (MIT→AGPL-3.0), and extended the monorepo Project structure section with the new scripts/ directory and templates dir explanation.

### TODO-002: Prompt v0.0.3 — fix word floor + article count drift on markdown sources
**Completed:** 93a2de8 (2026-04-09) — tightened structure rule to require markdown ## H2 headings explicitly, added word-count self-check with source-density warning, expanded code-example trigger list, inlined banned marketing words into the title rule. Verified with four smoke runs on Gemini Flash Lite against vercel.com + resend.com: 8/8 articles hit 3+ headings (was 4/9 on v0.0.2), 8/8 hit 150+ words (was 1/9). Residual: 1-of-16 titles still contained "streamline" — baseline noise rate, not a rule failure.
