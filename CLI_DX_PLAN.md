# CLI DX Plan — Road to 10/10

Source: `/plan-devex-review` on 2026-04-12. Starting score: **5.1/10**. Target: **10/10**.

Organized into 4 phases by leverage, not by pass. Ship Phase 1 before v0.1.
Each phase is independently landable.

---

## Phase 1 — Unlock the hosted-tier story (~6 hrs)

Without these, the hosted product has no CI path and no standalone auth. This
is the blocking phase for v0.1.

### 1.1 Extract auth into standalone commands

**Files:**
- New: `packages/cli/src/commands/login.ts`
- New: `packages/cli/src/commands/logout.ts`
- New: `packages/cli/src/commands/whoami.ts`
- Refactor: `packages/cli/src/commands/deploy.ts:24-101` — move the OTP flow into `lib/auth.ts`, have both `login` and `deploy` call it.
- Register in `packages/cli/src/index.ts`.

**Acceptance:**
- `helpbase login` runs OTP flow, stores to `~/.helpbase/auth.json`.
- `helpbase logout` clears the file.
- `helpbase whoami` prints email + tenant slug, or "not logged in".
- `helpbase deploy` still does the inline login flow if not authed (no regression).

### 1.2 `HELPBASE_TOKEN` for non-interactive deploy

**Files:**
- `packages/cli/src/lib/supabase-client.ts` — `createAuthClient()` reads `HELPBASE_TOKEN` env var before falling back to `~/.helpbase/auth.json`.
- `packages/cli/src/commands/deploy.ts` — if `process.env.HELPBASE_TOKEN` set and `--yes` passed, skip all prompts; fail loudly if slug is missing.

**Acceptance:**
- `HELPBASE_TOKEN=xxx helpbase deploy --slug foo --yes` completes without TTY.
- `helpbase login --print-token` prints a long-lived token to stdout for CI setup.

### 1.3 `helpbase link` — project-to-tenant binding

**Files:**
- New: `packages/cli/src/commands/link.ts`
- New: `packages/cli/src/lib/project-config.ts` — read/write `.helpbase/project.json` with `{ tenantId, slug }`.
- `deploy.ts:110` — prefer project config over `owner_id` lookup.

**Acceptance:**
- Multi-product owners can deploy different dirs to different tenants.
- `.helpbase/project.json` is created on first deploy and committed.

### 1.4 `helpbase open` — post-deploy dopamine

**Files:**
- New: `packages/cli/src/commands/open.ts` — shells to `open`/`xdg-open`/`start` based on platform.
- `deploy.ts` — print `→ helpbase open` as a next step after success.

**Acceptance:** `helpbase open` launches `https://<slug>.helpbase.dev` in the default browser.

---

## Phase 2 — First-run magical moment (~2 hrs)

The pieces exist but aren't wired into one forward-leaning flow.

### 2.1 Post-scaffold next-steps card

**Files:**
- `packages/create-helpbase/src/index.ts` (or wherever the scaffolder prints its final message) — after success, print:
  ```
  ✓ Created my-help-center

    Next:
      cd my-help-center && pnpm dev       Preview locally
      helpbase generate --url <site>       Import articles with AI
      helpbase deploy                      Go live on helpbase.dev

    Docs: https://helpbase.dev/docs/cli
  ```

### 2.2 Promote `deploy` in README

**Files:**
- `README.md` Quick Start section — add a third step after `pnpm dev`:
  ```bash
  helpbase deploy   # live at your-slug.helpbase.dev
  ```

### 2.3 Pre-flight check in `dev` and `audit`

**Files:**
- `packages/cli/src/commands/dev.ts` — before `execSync`, check that `package.json` exists and includes `next` in deps. If not, print "this doesn't look like a helpbase project. Run `npx create-helpbase` to scaffold one."
- `audit.ts` already handles this via `AuditError`; verify the message is consistent.

### 2.4 Fix the `add` vs `new` collision

**Files:**
- Rename current `new.ts` handler → fold into `add.ts`. `helpbase new` becomes the single entry point.
- `helpbase new` with no args → interactive (today's `add`).
- `helpbase new --type troubleshooting --title "Reset password"` → flag-driven (today's `new`).
- Ship 3 more templates in the `TEMPLATES` map: `getting-started`, `how-to`, `concept`. (AI-generate the bodies; 20 min.)
- Remove `add.ts` registration from `index.ts`.

**Acceptance:** One command, two modes. Four real templates. README's "new" examples still work.

---

## Phase 3 — Credibility & upgrade story (~4 hrs)

You're v0.0.1. Get ready to ship breaking changes without burning users.

### 3.1 CHANGELOG.md + release discipline

**Files:**
- New: `CHANGELOG.md` at repo root, Keep-a-Changelog format, seed with v0.0.1 entry.
- `packages/cli/package.json` — add `"homepage"` and `"repository"` fields so npm links to GitHub.

### 3.2 Update notifier

**Files:**
- `packages/cli/package.json` — add `update-notifier` dep (~12KB).
- `packages/cli/src/index.ts` — wire it at top:
  ```ts
  import updateNotifier from "update-notifier"
  import pkg from "../package.json" with { type: "json" }
  updateNotifier({ pkg }).notify()
  ```

**Acceptance:** Users on stale versions see a boxed "update available" message on every run.

### 3.3 Error code convention + doc URLs

**Files:**
- New: `packages/cli/src/lib/errors.ts` — `class HelpbaseError extends Error { code: string; docUrl: string }` and a `printError()` helper that always emits: problem, cause, fix, `→ see helpbase.dev/errors/<code>`.
- Refactor every `cancel(...)` / `console.error(...)` call across `packages/cli/src/commands/*.ts` to use it.
- New: `apps/web/app/errors/[code]/page.tsx` — dynamic error page (stubs OK for now).
- Seed error codes: `E_NO_CONTENT_DIR`, `E_INVALID_FRONTMATTER`, `E_AUTH_FAILED`, `E_SLUG_TAKEN`, `E_MISSING_API_KEY`.

**Acceptance:** Every CLI error prints a doc URL. Every doc URL resolves to something (even a stub).

### 3.4 `schemaVersion` migration story

**Files:**
- New: `docs/content-schema.md` — documents `schemaVersion: 1` contract, promises a codemod when v2 ships.
- `packages/shared/src/schemas.ts` — add a `migrate(frontmatter)` no-op stub for future versions.

---

## Phase 4 — Polish, community, measurement (~6 hrs)

Turn a 8/10 tool into a 10/10 tool.

### 4.1 CLI reference docs

**Files:**
- New: `scripts/generate-cli-docs.ts` — walks commander's `program.commands`, emits `docs/cli.md` with every command, flag, and example.
- Wire into `turbo.json` so `pnpm docs` regenerates it.
- New: `apps/web/content/docs/cli.mdx` — renders the generated reference.
- Add `.addHelpText('after', '...')` to every command with 2-3 worked examples.

**Acceptance:** `helpbase <cmd> --help` shows real examples. `helpbase.dev/docs/cli` is comprehensive.

### 4.2 Scaffolded `HELPBASE.md`

**Files:**
- `packages/create-helpbase/templates/<default>/HELPBASE.md` — drop in a ~40-line primer: where content lives, how `_category.json` works, frontmatter fields, `featured: true`, how to deploy. Written for the user, not us.

### 4.3 Community surface

**Files:**
- New: `CONTRIBUTING.md` — fork, clone, pnpm, smoke tests, conventional commits.
- New: `.github/ISSUE_TEMPLATE/bug_report.yml` + `feature_request.yml`.
- `README.md` — add a "Community" section with GitHub Discussions link (create the Discussions first).
- New: `packages/cli/src/commands/feedback.ts` — opens a prefilled GitHub issue URL in the browser with CLI version + OS auto-filled.

### 4.4 Opt-in anonymous telemetry

**Files:**
- New: `packages/cli/src/lib/telemetry.ts` — on first run, prompt once: "Share anonymous usage data to help us improve? (y/N)". Store choice in `~/.helpbase/config.json`.
- What to send: command name, duration, exit status, flags used (names only, no values), CLI version, OS/node version. **Never** content, URLs, emails, slugs.
- Endpoint: `apps/web/app/api/telemetry/route.ts` — rate-limited insert into Supabase.
- `helpbase config set telemetry off` to disable.

**Acceptance:** After one week of telemetry, you can answer: what's the real TTHW, which command fails most, what % of users reach `deploy`.

### 4.5 Published GitHub Action

**Files:**
- New repo: `Codehagen/helpbase-deploy-action`
- `action.yml` with inputs `content-dir`, `slug`, `token`. Runs `npx helpbase deploy --yes`.
- Add usage example to `README.md` and `docs/cli.md`.

### 4.6 `helpbase doctor`

**Files:**
- New: `packages/cli/src/commands/doctor.ts` — prints: CLI version, node version, platform, auth state (without leaking token), detected tenant, whether `content/` exists, whether `next` is installed, last 3 runs from a rolling log.

---

## Landed ahead of schedule

### Dev/QA auth harness (supports all phases)

**Files:**
- `packages/cli/scripts/mint-test-token.mjs` — uses `SUPABASE_SERVICE_ROLE_KEY` to create/confirm a test user and mint a real session JWT without sending email.
- `packages/cli/test/auth.integration.test.ts` — gated on the env var; skipped cleanly when absent.
- `pnpm mint:token` script alias.

**Use:**
```bash
export SUPABASE_SERVICE_ROLE_KEY=<from dashboard>
export HELPBASE_TOKEN=$(pnpm --filter helpbase mint:token)
node packages/cli/dist/index.js whoami
```

Unlocks end-to-end validation of the `HELPBASE_TOKEN` path without the OTP round-trip.

---

## Deferred (explicit non-goals for v0.1)

- **VS Code extension / MDX LSP** — defer to v0.2+. Frontmatter autocomplete would be nice; not load-bearing.
- **Template registry (`helpbase new --from @community/stripe`)** — plant the naming convention in Phase 2.4 but don't build the registry.
- **`helpbase audit` historical trend** — defer until telemetry (4.4) gives us the baseline.
- **Windows-specific smoke tests** — spot-check manually; full matrix later.

---

## Effort & sequencing

| Phase | Est | Unlocks |
|---|---|---|
| 1 — Hosted-tier unlock | 6 hrs | CI deploy, multi-product, standalone auth |
| 2 — Magical moment | 2 hrs | First-run story, no more command collision |
| 3 — Credibility | 4 hrs | Safe to ship v0.1 breaking changes |
| 4 — Polish & measurement | 6 hrs | 10/10 — data-driven from here on |

**Total: ~18 hrs to 10/10.** Phase 1 alone takes the overall score from 5.1 → ~7.2. Phase 1+2 → ~8.0. Phase 1+2+3 → ~9.0. All four → 10.

## Predicted scorecard after full plan

```
1. Getting Started    10/10   (next-steps card, pre-flight checks, deploy promoted)
2. CLI Design         10/10   (login/logout/whoami/link/open, real templates, --json everywhere)
3. Error Messages     10/10   (error codes, doc URLs, systematic)
4. Documentation      10/10   (CLI reference, inline --help examples, HELPBASE.md)
5. Upgrade Path        9/10   (changelog, notifier, schema policy — 10 needs a real migration shipped)
6. Dev Environment    10/10   (HELPBASE_TOKEN, CI mode, GitHub Action)
7. Community           9/10   (CONTRIBUTING, templates, feedback cmd — 10 needs active community)
8. Measurement        10/10   (opt-in telemetry feeding a live TTHW number)
```
