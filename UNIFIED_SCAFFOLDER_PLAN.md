# Unified Scaffolder Plan — one `create-helpbase`, any content source

Source: 2026-04-17 dogfood session. Follows the bundled-key ship (`helpbase@0.3.0`) + the create-helpbase auth/spinner fixes (`create-helpbase@0.2.1`).

---

## Review Decisions (`/plan-eng-review` 2026-04-17)

**Scope trimmed to Option B** — ship the new capability, defer speculative cleanup.

### In scope for v0.3.0

- **Phase 1.1**: walker built-in deny-list (`generated`, `dist`, `build`, `out`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache`, `target`, `coverage`, `__generated__`, `.vercel`, `.wrangler` + `*.min.js`, `*.min.css`, `*.map`, `*.snap`, `*-lock.json`, `*-lock.yaml`, `Cargo.lock`, `Gemfile.lock`, `poetry.lock`).
- **Phase 2.1**: `generate-from-repo.ts` composed directly from existing shared exports (`readContextSources`, `generateHowtosFromRepo`, `sanitizeMdx`, `articleToMdxWithCitations`, `enrichCitationsFromDisk`, `planContextWrites`). No new shared module.
- **Phase 2.3**: `emit-mcp-json.ts` helper — emits to `<projectDir>/mcp.json`, points `HELPBASE_CONTENT_DIR` at `<projectDir>/content/`.
- **Phase 3.1**: explicit top-level `select` ("A website URL" / "A code repository" / "Skip") + conditional path prompt with `fs.statSync` validation.
- **Phase 3.3**: three-stage spinner (Scanning → Synthesizing → Writing).
- **NEW**: GitHub URL detection in the website branch — if pasted URL matches `^https?://(www\.)?github\.com/`, show a second prompt "That looks like a GitHub repo. Clone and generate from source? [Y/n]". On yes, `git clone --depth 1` into a tmp dir and hand off to the repo branch.
- **NEW (Issue 1 fix)**: defer `clearSampleContent` until generation succeeds. Current code wipes before LLM call and the catch-branch message lies.
- **NEW (Issue 4 fix)**: if generation returns zero valid-citation docs, throw `AllDocsDroppedError` and show: "AI generation kept no articles — your repo may not have enough prose or the cheap model dropped citations. Retry with `--model anthropic/claude-sonnet-4.6` or run `helpbase context .` manually after scaffold." Sample content stays.
- **Phase 4 tests** + **smoke-install extension** — `scripts/smoke-install.sh --repo <fixture>` is MANDATORY per prior learning `reviews-miss-install-path`.

### Subject + prompt framing (inline decisions)

- LLM prompt uses the repo's `package.json` name (or basename of repo path) as the subject — NOT the user's typed scaffold project name. Matches `helpbase context` behavior.
- `mcp.json` lives at project root; `.helpbase/` is never created by the scaffolder (that layout is only for `helpbase context`).

### Review Decisions (`/plan-devex-review` 2026-04-17)

**Persona**: YC founder prototyping MVP (broader than Vegard-specific; higher bar).
**TTHW target**: Champion tier, under 2 minutes (down from planned 2:10).
**Magical moment**: localhost:3000 with articles cited to the user's own source files.
**Mode**: DX POLISH — bulletproof the flow, no scope expansion.

#### Four DX adds folded into this plan

1. **Conditional BYOK prompt** — if `~/.helpbase/auth.json` exists, skip the BYOK ask entirely. User is already authed, the question is noise. Lives in Phase 3.1 (the prompt flow).
2. **Eager walker** — if BYOK prompt is shown (no auth.json), start the repo walk in the background while the user reads the prompt. By the time they answer, we have source count + token estimate. Saves 1-3s on large repos. Phase 2.1 addition.
3. **Browser auto-open** — tail `pnpm dev` stdout, match Next.js's "Ready in XXXms" line, spawn `open` (macOS) / `xdg-open` (Linux) / `start` (Windows) on `http://localhost:PORT`. The magical moment has to land in the user's eyes, not their stdout. Phase 3 addition, ~15 lines of code.
4. **Docs update** — extend Phase 4 with: (a) `README.md` quickstart shows both URL and repo flows, (b) `apps/web/content/getting-started/installation.mdx` mirrors the scaffolder prompt structure, (c) scaffolded project's seed `README.md` snippet mentions the source it was generated from.

### NOT in scope (deferred)

- **Phase 1.2**: `.gitignore` respect — built-in deny-list covers the hagenkit case and ~90% of real projects. Revisit for v0.4.0 if users hit specific repos that need it.
- **Phase 2.2**: `runContextPipeline` extraction from `context.ts` (731 lines) — all the pieces the scaffolder needs are already exported from `ai-context.ts`. Extraction is speculative cleanup with real regression risk. Revisit when a third caller appears.
- **Phase 3.2**: blocking budget preview prompt — `TokenBudgetExceededError` already surfaces the over-budget case with an actionable error. Adding a "continue? [Y/n]" prompt is a friction beat for the 95% case where the budget is fine. Revisit if users report wasted quota.

### What already exists (reconciled with current code)

- `packages/shared/src/context-reader.ts:80` — `node_modules` skip is already there. Phase 1.1 extends this, doesn't rewrite.
- `packages/shared/src/context-writer.ts:123` — `planContextWrites` is already exported and ready to retarget from `.helpbase/docs/` to `content/`.
- `packages/cli/src/commands/context.ts:560` — `emitMcpJsonHint` exists as a private function. Phase 2.3 copies the pattern into a scaffolder-local helper (no extraction).
- `packages/shared/src/ai-context.ts` — exports `buildContextPrompt`, `estimateTokens`, `generateHowtosFromRepo`, `sanitizeMdx`, `articleToMdxWithCitations`, `enrichCitationsFromDisk`. All composable directly.
- `scripts/smoke-install.sh` — active install-path harness. Must extend for the repo branch (prior learning `reviews-miss-install-path`).

### Failure modes

| Codepath | Failure | Caught? | User sees |
|---|---|---|---|
| `readContextSources` | Over token budget | Yes | Actionable E_CONTEXT_OVER_BUDGET with top-10 largest files |
| `generateHowtosFromRepo` | Missing auth + BYOK | Yes | "Run `helpbase login` or set AI_GATEWAY_API_KEY" |
| Validator loop | All docs dropped | Yes (new) | Issue 4 message; sample preserved |
| `git clone` (GitHub branch) | Network / 404 / auth | **GAP** — plan needs to catch and show "Couldn't clone <url>. Check the URL or paste a local path." |
| `scanForSecrets` | Secret detected pre-write | Yes | Pattern name + line number, never the secret itself |
| `writeFileSync` | EACCES / ENOSPC | **GAP** — plan should note scaffolder aborts loudly, does not partial-write |

**Critical gaps flagged above**: 2 (git clone error handling, disk write failure).

---


## Problem

`create-helpbase` today only seeds content from a URL. The flagship repo-grounded flow (`helpbase context` → citations + llms.txt + mcp.json) is strictly better for developer-audience help centers but is a two-command path that requires users to already know the CLI exists. A new user running `pnpm dlx create-helpbase` always sees the URL flow and never discovers the repo flow — even though the repo flow is our strongest demo.

## Goal

One entry point — `pnpm dlx create-helpbase <name>` — that seeds the help center from a URL, a local repo path, or ships sample content only. User picks the source in one prompt. Same final artifact (Next.js app on localhost) regardless of path.

---

## Phase 1 — Walker ignore patterns (standalone prereq)

Fixes Finding #3 from the dogfood memory (`project_walker_ignores_missing.md`). Lands first because both `helpbase context` and the new scaffolder repo-flow depend on it.

### 1.1 Built-in deny-list in `walkMarkdownFiles`

**Files:**
- `packages/shared/src/context-reader.ts` — extend the existing `node_modules` / `.git` skip with a full deny-list.
- `packages/shared/src/__tests__/context-reader.test.ts` — cover each dir in the deny-list.

**Deny-list (always skipped, can be overridden with a future `--include-generated` flag):**
- Directory names: `node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache`, `target`, `coverage`, `generated`, `__generated__`, `.vercel`, `.wrangler`.
- File globs: `*.min.js`, `*.min.css`, `*.map`, `*.snap`, `*-lock.json`, `*-lock.yaml`, `Cargo.lock`, `Gemfile.lock`, `poetry.lock`.

**Acceptance:**
- Running `helpbase context .` on hagenkit walks <150 files (down from 311) and estimates <100k tokens (down from 477k).
- Existing tests still pass; the token budget regression disappears.

### 1.2 `.gitignore` respect (opt-out)

**Files:**
- `packages/shared/src/context-reader.ts` — add `readGitignorePatterns(repoRoot)` helper; apply as a second filter layer on the walker.
- `packages/shared/src/__tests__/context-reader.test.ts` — fixture with a `.gitignore` that excludes `secret/`; assert files under `secret/` are skipped.

**Scope intentionally narrow:**
- Parse line-by-line; skip comments (`#`) and empty lines.
- Support leading `/` (repo-relative anchor) and trailing `/` (dir only).
- Do **not** implement full gitignore semantics (no negation `!`, no `**` beyond what `minimatch` gives for free).
- CLI flag: `--no-respect-gitignore` disables. On by default.

**Acceptance:**
- Repo with `generated/` gitignored (but no entry in the built-in deny-list yet) skips the dir.
- `--no-respect-gitignore` walks everything including gitignored paths (for cases where `.gitignore` excludes files we want to document, e.g. example configs).

### 1.3 Ship as `helpbase@0.4.0` + `@workspace/shared`

**Packages bumped:**
- `helpbase`: `0.3.0` → `0.4.0` (minor — new walker behavior is user-visible even though it's strictly additive for most users).
- `@workspace/shared`: workspace-internal, no publish.

---

## Phase 2 — `generate-from-repo` in create-helpbase

Wraps the shared context pipeline behind a scaffolder-shaped API. Writes to `<projectDir>/content/` (the Next.js content root), not `.helpbase/docs/` (the agent-facing location `helpbase context` uses).

### 2.1 New `packages/create-helpbase/src/generate-from-repo.ts`

**Exports:**
```ts
export async function generateFromRepo(opts: {
  projectDir: string       // scaffold root (where content/ lives)
  repoPath: string         // absolute, pre-validated
  model: string
  authToken?: string
  maxTokens: number        // from --max-tokens or default 100_000
  onPhase?: (phase: "scraping" | "synthesizing" | "writing", detail?: string) => void
}): Promise<{ articlesWritten: number; droppedDocs: number }>
```

**Implementation:**
1. `onPhase("scraping")` → call `readContextSources(repoPath, ...)` from shared.
2. Budget check: if `tokensEstimated > maxTokens`, throw `RepoTooLargeError` (new class, caller maps to friendly prompt).
3. `onPhase("synthesizing", "(~15-30s)")` → call the existing `generateContextDocs` path (extracted from `context.ts`; see 2.2).
4. `onPhase("writing")` → map generated `GeneratedContextDoc[]` into the scaffolder's `content/<category>/<slug>.mdx` layout. Reuse `planArticleWrites` by adapting input shape, or write a new `planContextArticleWrites` that preserves the `## Sources` section.
5. Return counts for CLI display.

**Key difference from `helpbase context`:**
- Writes to `content/` not `.helpbase/docs/` (so Next.js picks it up).
- Emits `_category.json` per category (for the Next.js sidebar).
- Does NOT emit `.helpbase/mcp.json` here — that's optional and lives at the project root alongside; separate helper.

### 2.2 Extract `generateContextDocs` core from `packages/cli/src/commands/context.ts`

Pull the 16-step pipeline (or its LLM + validation + synthesis-report core) into a shared function so both `helpbase context` and `create-helpbase --from-repo` call the same code.

**Files:**
- New: `packages/shared/src/context-pipeline.ts` — exports `runContextPipeline(opts)` returning `{ docs, report }`.
- Refactor: `packages/cli/src/commands/context.ts` — thin wrapper over `runContextPipeline` + the CLI-specific write sites.
- Refactor: `packages/create-helpbase/src/generate-from-repo.ts` — same wrapper, different write sites.

**Invariants preserved:**
- Citation validator still pre-writes.
- Secret deny-list still pre-writes.
- Prompt injection mitigation (`<untrusted-repo-content>`) unchanged.
- Atomic writes + rollback unchanged.

**Acceptance:**
- `pnpm test -F shared` covers the extracted module directly.
- `pnpm test -F helpbase` still passes (CLI behavior unchanged).
- `helpbase context` output byte-identical to `0.3.0` on a fixture.

### 2.3 `emitMcpJson` helper at project root

After repo synthesis, write `<projectDir>/mcp.json` using the same per-client hint format `helpbase context` emits. Content points at `<projectDir>/content/` as `HELPBASE_CONTENT_DIR`.

**Files:**
- New: `packages/create-helpbase/src/emit-mcp-json.ts` (or extract from shared).
- `packages/create-helpbase/src/index.ts` — call after `generateFromRepo` resolves.

**Acceptance:**
- Fresh scaffold with repo source has `mcp.json` at root listing Claude Desktop / Cursor / Claude Code blocks.
- User can copy-paste into their MCP client and the server finds the content dir.

---

## Phase 3 — Unified prompt flow in `index.ts`

### 3.1 Single content-source prompt

Replace the current two prompts (URL then BYOK) with a branching flow:

```
┌  create-helpbase
│  Project name: my-docs
│
│  Seed content from?
│    ▸ A website (paste URL)
│      A code repository (paste local path)
│      Skip — ship with sample content
│
│  [if URL selected]  URL: https://…
│  [if repo selected] Repo path: ./my-repo
│
│  BYOK? Paste a Vercel AI Gateway key (optional — most people skip this and run `helpbase login` instead)
```

**Files:**
- `packages/create-helpbase/src/index.ts` — replace the current URL-only prompt with `@clack/prompts` `select` + conditional `text`.
- Retain BYOK prompt — unchanged.

### 3.2 Path validation + budget preview

For the repo branch:

1. Resolve the path: `path.resolve(process.cwd(), input)` so `.`, `./x`, and `/abs/x` all work.
2. Validate: `fs.statSync` + `isDirectory()`; friendly error if not.
3. Run the Phase 1 walker to count sources + estimate tokens.
4. Show: `Found 76 source files, ~123k tokens. That's ~25% of your daily free quota. Continue? [Y/n]`.
5. If user declines, fall back to sample content (same as URL flow today when the user cancels).

**Files:**
- `packages/create-helpbase/src/index.ts` — inline validation + confirm prompt.

### 3.3 Three-stage spinner (apply today's lesson)

Use the same pattern from `create-helpbase@0.2.1`:

```
✓ Scanning repo...          (1-3s, from walker)
✓ Synthesizing articles...  (15-30s, the LLM call)
✓ Writing articles...        (<1s)
```

The `onPhase` callback on `generateFromRepo` drives the spinner state changes.

---

## Phase 4 — Test + publish

### 4.1 Integration test

**Files:**
- `packages/create-helpbase/test/cli.integration.test.ts` — new `"seeds from a repo path"` case using the existing `demo-repo` fixture.
- Mock the LLM call (re-use existing mocks from CLI context tests).

### 4.2 CHANGELOG + release

**Packages bumped:**
- `create-helpbase`: `0.2.1` → `0.3.0` (new top-line feature).
- `helpbase`: already shipped `0.4.0` in Phase 1.

**CHANGELOG entry:**
- Single `[0.3.0]` section covering all three: repo source, walker ignores, unified prompt flow.

### 4.3 Publish + dogfood

1. `pnpm -F create-helpbase publish`.
2. Dogfood in a fresh dir against a small OSS repo (e.g. `sindresorhus/p-map`).
3. Dogfood against hagenkit (should now fit under budget).
4. Save findings to memory.

---

## Risks / open questions (eng)

1. **Pipeline extraction is load-bearing.** `context.ts` is 700+ lines of carefully ordered steps. Getting `runContextPipeline` right without regressing citations, secrets, or atomic writes is the biggest risk. Mitigate with byte-identical fixture test before refactor lands.

2. **Path detection heuristic.** `http://` / `https://` → URL is easy. Local path validation covers most cases. Open: do we clone a GitHub URL (`github.com/foo/bar`)? Suggest **no for v1** — clone-and-walk is a bigger feature. v1 = local paths only. v2 = clone.

3. **Quota preview is blocking.** User sees walker estimate, must confirm before the LLM call. On slow connections the walker runs fast (<1s) but the confirm prompt adds a friction beat. Alt: background the walker while the user confirms BYOK; if confirm arrives before walker done, wait. Probably overkill for v1.

4. **`.gitignore` semantic parity.** Full gitignore is hard (negation, `**`, per-directory `.gitignore`). Scoped to "line-by-line prefix + trailing-slash" for v1. Users who want more can use `--no-respect-gitignore`.

5. **Output layout drift.** `helpbase context` writes to `.helpbase/docs/`. `create-helpbase --from-repo` writes to `content/`. The MDX content is identical; only the root differs. Downstream consumers (Next.js app, MCP server, llms.txt generator) need to be path-aware — they already are (via `HELPBASE_CONTENT_DIR`), so no churn expected. Double-check the llms.txt generator script the scaffold ships with.

---

## Success criteria

- `pnpm dlx create-helpbase@0.3.0 my-docs` → pick URL → works (no regression from 0.2.1).
- Same, pick repo, small OSS repo → `content/` gets 4-8 cited articles, dev server renders them with the `## Sources` section expanded.
- Same, pick repo, hagenkit → budget prompt shows a passable number (thanks to Phase 1 ignores), user can accept or decline.
- Same, pick skip → sample content unchanged.
- `helpbase context` on hagenkit finishes under the daily cap.
- `helpbase context` on the helpbase repo itself produces byte-identical output to `0.3.0`.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 4 issues, 2 critical gaps, SCOPE_REDUCED mode |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 1 | CLEAR | score 8/10, TTHW 2:10 → < 2min (Champion), 4 DX adds folded in, POLISH mode |

**UNRESOLVED:** 0
**CRITICAL GAPS:** 2 (git clone error handling, disk-write failure handling — both noted in Failure modes table above, must be addressed in implementation)
**VERDICT:** ENG + DX CLEARED — scope trimmed, DX principles all covered, Champion-tier TTHW achievable. Ready to implement.

