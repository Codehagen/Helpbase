# Device-flow login — migrate auth to Better Auth, then wire `helpbase login` to the device-authorization plugin

Source: 2026-04-17 dogfood of `helpbase@0.4.1` (URL-paste fallback) revealed three context switches on every login. Captured as **TODO-020**. Initial plan drafted a custom device-flow on top of Supabase. `/plan-eng-review` + context7 research (`/websites/better-auth`) found that Better Auth ships first-class `deviceAuthorization` and `bearer` plugins that implement RFC 8628 natively, and ships an official Supabase migration script. The auth-provider seam at `packages/cli/src/lib/auth.ts:11–16` already anticipates this migration with the comment *"When helpbase migrates to Better Auth, only this file needs to change."*

Decision (2026-04-17): migrate first, ship device flow second. Two PRs. **Email transport switches to Resend** as part of PR 1 (eliminates the Supabase-email-template fragility that started this thread). User base is n=1 (the founder), so migration cost is at its lifetime minimum.

---

## Problem

`helpbase login` today:
1. CLI prompts for email.
2. Supabase sends a magic-link email (URL only — Supabase's default template has no 6-digit code).
3. User leaves the terminal, opens email, copies URL.
4. Pastes URL back in terminal.
5. CLI parses `access_token` / `refresh_token` out of the URL fragment, writes `~/.helpbase/auth.json`.

Three context switches. Fragile on email clients that rewrite `#fragment`. New users' first-touch surface is this friction. The scaffolder (`create-helpbase@0.3.1`) now runs `helpbase login` inline, so the friction is in `create-helpbase`'s TTHW path too.

The proper fix is a `gh auth login --web` / `claude login` / `supabase login` style browser-bounce flow. Which is exactly what Better Auth's `deviceAuthorization` plugin implements.

## Strategy — two PRs

**PR 1: Migrate auth from Supabase to Better Auth.** No new features. The existing magic-link-URL-paste CLI login UX is preserved — just powered by Better Auth's `magicLink` plugin (with Resend as the email transport) instead of Supabase's `signInWithOtp`. Validate end-to-end, then merge + deploy.

**PR 2: Add the `deviceAuthorization` server plugin + swap the CLI to `deviceAuthorizationClient`.** Strictly additive on top of PR 1. ~60 lines of CLI code, plugin owns the device-code / user-code / expiry / atomic-consume state machine.

Staging is the deliberate risk control. A broken migration doesn't block the device-flow feature. A broken device-flow doesn't require rolling back the migration. Each PR is reviewable in <1 hour.

## Goal

End state after both PRs:

- `helpbase login` default: opens the browser, user signs in (or is already signed in on helpbase.dev), clicks Authorize (with user-code shown for phishing defense), terminal picks up the bearer token, writes `~/.helpbase/auth.json`. Under 10 seconds on the fast path.
- `helpbase login --email` still works as the CI / sandboxed-env fallback, now powered by Better Auth magic-link.
- `apps/web` runs on Better Auth. Supabase's `auth.users` table is no longer authoritative; Better Auth's `user` / `session` / `account` tables are. Supabase-as-database stays (for tenant content, `llm_usage_events`, `global_daily_tokens`, etc.) — only the auth layer moves.
- Email transport is Resend. Zero dependency on Supabase email template config.
- Existing `HELPBASE_TOKEN` env shape preserved (opaque bearer token).

---

## What already exists (reconciled with current code)

- `packages/cli/src/lib/auth.ts` — `AuthSession`, `getCurrentSession`, `storeSession`, `loadStoredSession`, `clearStoredSession`, `isNonInteractive`. Provider-agnostic surface by design. The `client.auth.setSession` calls get replaced with `authClient.getSession({ headers: { Authorization: ... } })`.
- `packages/cli/src/lib/supabase-client.ts` — deleted in PR 1. Replaced by a thin `better-auth/client` factory in a new `packages/cli/src/lib/auth-client.ts`.
- `apps/web/lib/supabase-admin.ts:36` — `verifyBearerToken(token)`. Replaced by `auth.api.getSession({ headers })` (Better Auth bearer plugin pattern). One-line swap in every call site.
- `apps/web/lib/supabase.ts` — stays. Still used for tenant content + LLM usage counters. Not auth.
- `apps/web/app/api/v1/llm/_shared.ts:36` — `withAuthAndQuota`. Swap the token verification line. Rest of the function (quota, limits, wire error envelope) is unchanged.
- `apps/web/lib/rate-limit.ts:43` — unchanged. Still the per-IP / per-tenant pattern. Prior learning `rate-limit-fire-and-forget-write` still applies.
- `packages/create-helpbase/src/index.ts:794` — `openBrowser` helper. In PR 2 we reuse `open` from npm (Better Auth's docs use it) and delete the inline platform-branch helper. Or keep ours and skip the `open` dep. TBD in PR 2.
- Existing Supabase DB tables: `llm_usage_events`, `global_daily_tokens`, `tenants`, `tenant_articles`. These reference `auth.users.id`. We preserve user IDs during migration, so FKs keep working.

---

## PR 1 — Supabase auth → Better Auth + Resend

### 1.1 Install + configure Better Auth on `apps/web`

**Files:**
- New: `apps/web/lib/auth.ts` — `betterAuth()` config. Postgres pool pointing at the same Supabase DB (standard Better Auth + Supabase-as-database pattern). Plugins: `magicLink`, `bearer`.
- New: `apps/web/lib/auth-client.ts` — server-side `authClient` for route handlers if needed.
- New: `apps/web/app/api/auth/[...all]/route.ts` — Better Auth's catch-all route handler (per Better Auth Next.js docs).
- Modify: `apps/web/package.json` — add `better-auth`, `resend`, `@auth/better-auth-cli` (for schema generation).

```ts
// apps/web/lib/auth.ts
import { betterAuth } from "better-auth"
import { magicLink, bearer } from "better-auth/plugins"
import { Pool } from "pg"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY!)

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL! }),
  plugins: [
    bearer(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: "helpbase <login@helpbase.dev>",
          to: email,
          subject: "Sign in to helpbase",
          text: `Click to sign in: ${url}\n\nThis link expires in 10 minutes.`,
        })
      },
    }),
  ],
  trustedOrigins: ["https://helpbase.dev", "http://localhost:3000"],
})
```

**Env additions (Vercel + local):**
- `DATABASE_URL` — Postgres connection string for the Supabase DB. Pooler URL from Supabase project settings. Already available, just needs to be added to Vercel env.
- `RESEND_API_KEY` — new.
- `BETTER_AUTH_SECRET` — random 32-byte base64, for session signing.
- `BETTER_AUTH_URL` — `https://helpbase.dev` in prod, `http://localhost:3000` in dev.

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` stay — still used for tenant content + LLM usage tables. `SUPABASE_SERVICE_ROLE_KEY` stays for the same reason.

### 1.2 Schema — Better Auth tables alongside Supabase tables

Better Auth owns its own `user`, `session`, `account`, `verification` tables in the public schema. These live **alongside** Supabase's `auth.users`. During migration we copy `auth.users` → `public.user` preserving IDs. Post-migration, Supabase's `auth.users` is no longer written to; `public.user` is authoritative.

**Files:**
- New: `apps/web/drizzle/schema.ts` — Better Auth-generated schema (via `npx @better-auth/cli generate`).
- New: `apps/web/drizzle/migrations/0001_init_better_auth.sql` — generated migration.
- Modify: `apps/web/package.json` — add `drizzle-orm` + `drizzle-kit` (Better Auth's recommended schema tool). Or use plain SQL migrations if we prefer to keep the dep list lean.

**FK reconciliation:**
- `llm_usage_events.user_id` references `auth.users(id)` today. After migration, point the FK at `public.user(id)` via `ALTER TABLE llm_usage_events DROP CONSTRAINT ... ADD CONSTRAINT ... REFERENCES public.user(id);`. IDs are preserved so no row breaks.
- `tenants.user_id` (if any) — same treatment.
- Run as part of the migration SQL; keep idempotent with `IF EXISTS` guards.

### 1.3 Migration script

Adapt Better Auth's official Supabase migration guide (`https://better-auth.com/docs/guides/supabase-migration-guide`):

**Files:**
- New: `scripts/migrate-to-better-auth.mjs` — batch reader over `auth.users`, maps each row to Better Auth's `user` + `account` shape, inserts via the Better Auth internal adapter (or raw INSERTs — both are documented paths). Batch size 5000, cursor-based resume via `lastProcessedId`.
- Preserves: `id` (critical for FK), `email`, `emailVerified` (from `email_confirmed_at`), `name` (from `raw_user_meta_data.full_name` or email prefix), `createdAt`, `updatedAt`.
- One-shot run against prod — user base is n=1 so this is a single-row migration in practice. Test data preserved in case we get test users between now and ship.
- Idempotent via `ON CONFLICT (id) DO NOTHING`.

**Acceptance:**
- `SELECT count(*) FROM auth.users` = `SELECT count(*) FROM public."user"` after migration.
- `select email from public.user where email = 'christer.hagen@gmail.com'` returns one row.
- Post-migration, `SELECT id FROM llm_usage_events` + `SELECT id FROM public.user` join cleanly (FK works).

### 1.4 Rewire `/api/v1/llm/*` auth

**Files:**
- Modify: `apps/web/app/api/v1/llm/_shared.ts` — replace `verifyBearerToken(token)` call with `auth.api.getSession({ headers: req.headers })`. The function already expects a session-shaped return; adapt the return type.
- Delete: `apps/web/lib/supabase-admin.ts:36` — `verifyBearerToken`. Replaced.
- Keep: `apps/web/lib/supabase-admin.ts:15` — `getServiceRoleClient`. Still needed for `llm_usage_events` insert + `global_daily_tokens` RPC.

**Contract preserved:**
- CLI sends `Authorization: Bearer <token>`. That still works — `bearer()` plugin intercepts it.
- `userId` / `email` returned from session verification stays the same shape. The rest of `withAuthAndQuota` (quota math, limits, wire error envelope) doesn't change.

### 1.5 CLI rewire (preserves 0.4.1 UX)

**Files:**
- New: `packages/cli/src/lib/auth-client.ts` — creates `authClient` via `createAuthClient({ baseURL: "https://helpbase.dev", plugins: [bearerClient()] })`. Replaces `getAnonSupabase`.
- Modify: `packages/cli/src/lib/auth.ts` — replace the five Supabase calls:
  - `sendLoginCode(email)` → `authClient.signIn.magicLink({ email, callbackURL: "/login/cli/success" })`.
  - `verifyLoginFromMagicLink(url)` → parse the same token params out of the URL fragment (Better Auth's magic-link callback writes compatible params) OR call `authClient.magicLink.verify({ token })` if the URL carries a `token` query param (check Better Auth's magic-link output format during implementation).
  - `verifyLoginCode(email, code)` → Better Auth's magic-link is URL-only by default; if we want a 6-digit code, there's `otp()` plugin. PR 1 just mirrors today's URL-paste path; `verifyLoginCode` becomes a stub that throws "unsupported — paste the URL from the email".
  - `resolveTokenSession(token)` → `authClient.getSession({ fetchOptions: { headers: { Authorization: \`Bearer ${token}\` } } })`.
  - `getCurrentSession` refresh path → Better Auth handles refresh server-side; CLI just re-calls `getSession` and persists the response.
- Delete: `packages/cli/src/lib/supabase-client.ts`. No longer needed.
- Modify: `packages/cli/package.json` — remove `@supabase/supabase-js`, add `better-auth`.

**What the user sees on PR 1:**
- `helpbase login` — same as today. Email prompt → email arrives from `login@helpbase.dev` (Resend, not Supabase) → user pastes URL → "Logged in as christer.hagen@gmail.com". Zero UX delta. Email template is now our own HTML (one `sendMagicLink` function to edit).

### 1.6 Dev + CI

**Files:**
- Modify: `apps/web/.env.example` — document new env vars.
- Modify: `README.md` — document Better Auth env setup in the "Local development" section.
- Modify: `scripts/smoke-install.sh` — add an auth smoke that hits `/api/auth/session` on the scaffolded app.
- Modify: `.github/workflows/ci.yml` — add `BETTER_AUTH_SECRET` + `RESEND_API_KEY` (mocked in CI) to the test matrix.

### 1.7 Ship

- Merge to `main` → Vercel auto-deploys (`vercel_auto_deploy` memory).
- Dogfood: `rm -f ~/.helpbase/auth.json && helpbase login` end-to-end. Email from Resend lands, URL pastes, CLI writes token, `/api/v1/llm` accepts it.
- **Do not delete** Supabase's `auth.users` table post-migration — leave it as a read-only backup for 30 days. Cleanup is a follow-up TODO.

### 1.8 PR 1 success criteria

- `helpbase login` works end-to-end via Better Auth + Resend. UX identical to 0.4.1.
- `curl -H "Authorization: Bearer $(jq -r .access_token ~/.helpbase/auth.json)" https://helpbase.dev/api/v1/usage/today` returns the quota snapshot.
- Fresh user: `helpbase login` with a new email → Better Auth creates a `public.user` row, `auth.users` stays untouched.
- Existing code path: `pnpm dlx create-helpbase@latest foo` → pick "A code repository" → pick "Log in" → same user-visible flow as before.
- `pnpm -F web test && pnpm -F helpbase test` green.

---

## PR 2 — Device authorization plugin + OAuth providers + CLI `authClient.device.*`

Strictly additive. Requires PR 1 to be merged + deployed.

**DX review (2026-04-17) raised the bar on PR 2.** Three additions folded in:
1. **OAuth providers (Google + GitHub)** to drop cold-path TTHW from ~60s (magic-link round-trip) to ~15s (one-click sign-in). Eliminates the email round-trip entirely for the 100% of first-time scaffolder users who aren't yet cookied on helpbase.dev.
2. **Tier-3 error catalog** — 6 structured error codes with matching `/errors/[code]` pages and telemetry drop-off logging. Mirrors the pattern shipped for `helpbase sync` + `helpbase context`.
3. **Progressive polling hints** — CLI surfaces contextual help at T+30s, T+90s, T+4min while waiting on browser approval, so the YC-founder persona never hits the 3-minute silent-spinner abandonment zone.

### 2.1 Add `deviceAuthorization` server plugin

**Files:**
- Modify: `apps/web/lib/auth.ts` — append `deviceAuthorization()` to the plugins array.
- Generated: `apps/web/drizzle/migrations/0002_device_authorization.sql` — Better Auth writes the `deviceCode` table migration automatically via `npx @better-auth/cli generate`.

Plugin config:
```ts
deviceAuthorization({
  expiresIn: "5m",
  interval: "2s",
  // The browser-facing page path that the user visits.
  // Better Auth mounts its own /device endpoint; we customize the UI via our route.
  verificationUri: "/device",
})
```

### 2.1b OAuth providers (Google + GitHub)

**Files:**
- Modify: `apps/web/lib/auth.ts` — add `socialProviders: { google: {...}, github: {...} }` to the `betterAuth()` config.
- Modify: `apps/web/.env.example` — document `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
- Modify: `apps/web/app/device/AuthorizeDeviceClient.tsx` — when user is signed-out, show three buttons: "Continue with Google", "Continue with GitHub", "Sign in with email" (collapses the magic-link form to secondary).

**Pre-merge operator work (documented in plan, not in code):**
- Create a Google OAuth 2.0 Client in the Google Cloud console. Authorized redirect URI: `https://helpbase.dev/api/auth/callback/google` + local dev. Verified domain requirements noted in Better Auth docs.
- Create a GitHub OAuth App at github.com/settings/developers. Callback URL: `https://helpbase.dev/api/auth/callback/github` + local dev.
- Add the four env vars to Vercel prod + the local `.env.local`.

**trustedOrigins dynamic construction:**
```ts
trustedOrigins: [
  "https://helpbase.dev",
  "http://localhost:3000",
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
].filter(Boolean),
```
So preview deploys can authenticate.

**What the cold-path user sees:**
1. `helpbase login` → browser opens at `/device?user_code=ABCD-EFGH`.
2. Not signed in → three buttons.
3. Click "Continue with Google" → Google consent screen (if not already consented) → redirect back to `/device?user_code=ABCD-EFGH` signed-in → Authorize card → click → done.
4. Cold-path TTHW: ~15s. Matches `gh auth login --web`.

**Email fallback preserved.** If the user prefers magic-link (corporate SSO restriction, privacy preference), the third button works unchanged.

### 2.2 Browser-facing page

**Files:**
- New: `apps/web/app/device/page.tsx` — server component. If the user is not signed in (no Better Auth session cookie), show inline magic-link sign-in (same `<MagicLinkForm>` component PR 1 built for the standalone `/login` page). If signed in, show `<AuthorizeDeviceClient>`.
- New: `apps/web/app/device/AuthorizeDeviceClient.tsx` — client component. Reads `user_code` from `?user_code=<code>` (pattern from the plugin). Displays:
  - "You're signing the helpbase CLI in. Code: **ABCD-EFGH**"
  - "Signed in as `<email>`."
  - Buttons: "Authorize" / "Cancel".
  - On Authorize: `authClient.device.approve({ userCode })`. On Cancel: `authClient.device.deny({ userCode })`.
  - On success: "Done. Return to your terminal." Auto-close tab after 2s.

**Phishing defense comes for free:** the user-code shown on the page matches what the CLI printed in the terminal. User compares; if they don't match, this is a phishing URL.

### 2.3 CLI device-flow

**Files:**
- Modify: `packages/cli/src/commands/login.ts` — port the device-flow state machine from Better Auth's docs, but **do NOT copy the `console.log` + emoji output verbatim**. Reshape through our existing UI helpers (`intro`, `note`, `spinner`, `pc.cyan`) so the output matches the voice of `helpbase new` / `helpbase context`.
- Modify: `packages/cli/src/lib/auth-client.ts` — add `deviceAuthorizationClient()` to the plugin list.
- Add `--email` option on `login` command that preserves the PR 1 magic-link-URL-paste flow (escape hatch for CI / sandboxed envs).
- New util: `packages/cli/src/lib/open-browser.ts` — extract the existing platform-branched helper from `create-helpbase/src/index.ts:794–809` (DRY). Avoid adding the `open` npm dep (~150KB) — we already have a working 15-line helper that handles `darwin`/`win32`/`linux`.
- Respect `HELPBASE_LOGIN_NO_BROWSER=1` env: skip auto-open, print URL + user-code for manual entry.
- **Auto-detect browser-less environments** and set the same behavior. Check `process.env.CODESPACES === "true"`, `process.env.SSH_TTY`, `process.env.SSH_CONNECTION`. When detected, print a one-line "Detected remote session — skipping auto-open" and fall through to the URL-print path.

**Terminal output shape (post-voice-adjustment):**
```
┌  helpbase login
│
◆  Opening your browser to authorize…
│  URL:  https://helpbase.dev/device?user_code=ABCD-EFGH
│  Code: ABCD-EFGH
│
│  (compare this code to what the browser shows — if they differ, cancel
│   and run `helpbase login` again in a fresh terminal)
│
◇  Waiting for browser approval…
│
└  Logged in as me@company.com
```

**Progressive polling hints.** The spinner text updates on a timer regardless of polling activity:
- **T+0s:** "Waiting for browser approval…"
- **T+30s:** "Still waiting… check that a browser tab opened. URL: https://helpbase.dev/device?user_code=ABCD-EFGH"
- **T+90s:** "Taking longer than usual? Cancel with Ctrl-C, then run `helpbase login --email` for the fallback."
- **T+4min:** "1 minute until this code expires."
- **T+5min:** exits with `E_DEVICE_EXPIRED` (see error catalog below).

Implemented as a `setInterval` inside `pollForToken` that rewrites the clack spinner message at each threshold. No extra polling load on the server — these are purely client-side.

### 2.3b Error catalog (Tier 3)

Six error codes, each with inline CLI copy (problem + cause + fix + docs link), a `helpbase.dev/errors/[code]` page (reuse `apps/web/app/(main)/errors/[code]/page.tsx`), and a telemetry event (opt-in via existing consent, logs the code + duration_ms_before_error). Prior learning `error-messages-need-working-links` — each docs page must ship in the same PR as the error, not later.

| Code | When | CLI message (abbreviated) | Docs page |
|---|---|---|---|
| `E_DEVICE_DENIED` | User clicks Cancel in browser | "Cancelled. Run `helpbase login` again when you're ready." | `/errors/e-device-denied` |
| `E_DEVICE_EXPIRED` | 5-min code TTL hit | "Device code expired. Run `helpbase login` again." | `/errors/e-device-expired` |
| `E_DEVICE_NETWORK` | /device/token fetch fails after 3 retries | "Couldn't reach helpbase.dev. Check your network, then retry. `helpbase login --email` also works offline-to-email." | `/errors/e-device-network` |
| `E_DEVICE_NO_BROWSER` | Auto-detect browser-less OR `openBrowser` throws | "No browser detected. Open this URL manually: <url>. Code: <code>." | `/errors/e-device-no-browser` |
| `E_LOGIN_RESEND_DOWN` | `sendMagicLink` returns Resend error (PR 1 surface) | "Couldn't send sign-in email. Resend error: <msg>. Try again in a minute." | `/errors/e-login-resend-down` |
| `E_LOGIN_STALE_TOKEN` | `~/.helpbase/auth.json` present but `getSession` returns null | "Your previous session expired. Starting a fresh login…" (non-fatal — flow continues into login) | `/errors/e-login-stale-token` |

**Telemetry field:** each error captures `{ code, duration_ms_before_error, stage: "pre-browser" | "polling" | "post-approve" }` into the existing telemetry pipeline. Lets us measure drop-off by stage and iterate error copy.

**Files:**
- New: `apps/web/app/(main)/errors/e-device-denied/page.tsx` + 5 others (one per code). Each page: "What happened / Why / What to do / What to try instead" four-section layout matching the existing `/errors/e-no-citations` pattern.
- Modify: `packages/cli/src/lib/errors.ts` — register the 6 codes.
- Modify: `packages/cli/src/lib/telemetry.ts` — add `logLoginError(code, fields)` helper.

### 2.3c Stale-session UX (PR 1 + PR 2 shared)

If the CLI detects a token on disk but `authClient.getSession` returns null (stale post-migration, expired, or revoked), do NOT silently re-prompt. Print one line first:

```
◇  Your previous session expired. Starting a fresh login…
```

Then proceed into the device-flow. Friction-point-free.

### 2.4 Scaffolder inherits the new flow

`packages/create-helpbase/src/index.ts:749–770` (`runHelpbaseLogin`) just spawns `helpbase login`. Zero changes needed. The moment `helpbase@0.5.0` ships, the scaffolder's "Log in" branch bounces through the browser automatically.

### 2.5 Tests

**Files:**
- New: `packages/cli/src/lib/__tests__/device-auth.test.ts` — mocks `authClient.device.*`, covers happy-path polling, `authorization_pending`, `slow_down`, `access_denied`, `expired_token`, `HELPBASE_LOGIN_NO_BROWSER`, Codespaces/SSH auto-detect, each of the 6 error codes, progressive-hint thresholds (fake timers).
- New: `apps/web/app/device/__tests__/page.test.tsx` — renders the server component for signed-in / signed-out / unknown-code cases, plus the OAuth-provider button render paths.
- New: `apps/web/app/(main)/errors/__tests__/device-errors.test.tsx` — smoke-renders each of the 6 error pages (catches the error-link-must-work-pre-ship regression).
- Modify: `scripts/smoke-install.sh` — add a `--device-login` mode with a mocked-auth server.

### 2.6 Ship

- Publish `helpbase@0.5.0`.
- CHANGELOG: "`helpbase login` now uses a browser device-flow. Legacy magic-link path preserved behind `--email`."
- Dogfood the full `pnpm dlx create-helpbase` flow → pick repo → pick Log in → browser bounces, Authorize click, cited docs at localhost:3000. No email involvement on the happy path.
- Save findings to memory.
- Rewrite `project_vegard_walkthrough.md` to drop the "check your email" step.

### 2.7 PR 2 success criteria

**TTHW (measurable):**
- Warm path (cookied on helpbase.dev): ≤10s end-to-end, ≤15s p95.
- Cold path via Google/GitHub OAuth: ≤20s end-to-end (first-time-only consent screen adds ~5s).
- Cold path via email fallback: ≤75s including email delivery round-trip.
- `pnpm dlx create-helpbase` → repo → Log in → OAuth → cited docs at localhost:3000: ≤2min total (Champion tier).

**Behavior:**
- User-code shown in both CLI and browser; docs/error messages tell users to compare them.
- `HELPBASE_LOGIN_NO_BROWSER=1 helpbase login` prints URL + user-code and polls. Auto-detects `CODESPACES=true`, `SSH_TTY`, `SSH_CONNECTION` and behaves the same without the env var.
- `helpbase login --email` still runs the PR 1 magic-link-paste flow unchanged.
- All 6 error codes render a matching `/errors/[code]` page on helpbase.dev (no 404 links).
- Progressive polling hints fire at the documented T+30/90/240s thresholds.
- First-run post-migration: stale-token users see the "previous session expired" message, not a silent re-prompt.

**Instrumentation:**
- `login_duration_ms` telemetry event (opt-in, respects existing consent). Fields: `{ path: "warm" | "oauth-google" | "oauth-github" | "email", duration_ms, outcome: "success" | "<error_code>" }`.
- After 20 real login events, we have a measured distribution to compare against the claims above. Feeds the post-ship `/devex-review` boomerang.

### 2.8 Docs updates (PR 2)

**Files:**
- Modify: `README.md` — quickstart now mentions "the CLI opens a browser and shows a short code; compare it to the browser." One sentence, sets expectation.
- Modify: `packages/cli/README.md` — add a "Logging in" section covering the three paths (default device flow, `--email` fallback, `HELPBASE_TOKEN` for CI).
- Modify: `apps/web/content/getting-started/installation.mdx` — mirror the README update.
- Modify: `project_vegard_walkthrough.md` — strip the "check your email" step; walkthrough now reads "click Authorize in the browser tab that just opened."

---

## Failure modes (both PRs combined)

| Codepath | Failure | Caught? | User sees |
|---|---|---|---|
| Resend API down | Magic-link email never sends | Yes (Resend returns error) | `sendMagicLink` surfaces the error, CLI prints "Couldn't send sign-in email. Try again or paste a URL." |
| `/api/auth/*` 500 | Better Auth bug | Yes | CLI sees fetch error, prints "Couldn't reach helpbase.dev — check your network or run `helpbase login --email`." |
| Migration script — duplicate email conflict | `ON CONFLICT (id) DO NOTHING` skips rows | Partial — logged | Script prints per-row outcome; Christer's row is the only real one |
| FK repoint fails mid-migration | Transactional BEGIN/COMMIT | Yes | Migration aborts, Supabase auth still primary, rollback trivial |
| `authClient.device.code` errors | Plugin returns standard `error.error_description` | Yes | CLI prints a human-readable message and exits 1 |
| Polling: `slow_down` | Plugin's standard response | Yes | CLI increases interval (per Better Auth's docs) |
| Polling: `expired_token` | Row TTL hit | Yes | CLI prints "Login timed out — run `helpbase login` again" |
| Browser `open` fails (no xdg-open / missing util) | — | Yes | URL + user-code always printed to stdout first; user copies manually |
| User denies authorization in browser | `access_denied` from plugin | Yes | CLI prints "Cancelled." and exits 0 |
| User closes browser tab mid-flow | Row expires after 5min | Yes | Same as `expired_token` |
| Phishing: attacker sends victim a `/device?user_code=...` URL | User-code display is the whole defense | Yes | Victim compares user-code to their own terminal; mismatch = don't click |
| `RESEND_API_KEY` missing in prod | Better Auth boot fails | Yes | Vercel build / runtime error surfaces; operator gets clear log |
| `DATABASE_URL` not set | Better Auth can't boot | Yes | Vercel env check fails at deploy time |
| Stale `~/.helpbase/auth.json` with Supabase-format token post-migration | `auth.api.getSession` returns null | Yes | CLI falls back to unauthed state, prompts re-login |

---

## Risks / open questions (eng)

1. **Migration atomicity.** Copying `auth.users` → `public.user` + re-pointing FKs is a multi-statement operation. Wrap in a transaction. Back up `auth.users` before running (`pg_dump` of the `auth` schema). Test on a Supabase branch DB first (Supabase branches are cheap).

2. **Better Auth + Supabase Postgres pooler compatibility.** Supabase's pooler is PgBouncer in transaction mode, which doesn't support session-level features like `LISTEN`. Better Auth uses the standard `pg` Pool — no `LISTEN` — so should be fine. Confirm by running migration script against a Supabase branch before prod.

3. **`bearer()` plugin semantics.** The token Better Auth issues is a long random string (not a JWT). `~/.helpbase/auth.json` schema stays compatible because the CLI treats tokens opaquely — but `expiresAt` handling may shift. Check Better Auth's session expiry defaults and update the CLI's refresh logic if needed.

4. **Refresh tokens.** Better Auth uses rolling session cookies server-side; the bearer token surface may or may not expose a separate refresh token. Need to verify during PR 1 implementation. If no refresh token, CLI just re-runs `login` when the bearer expires (default 7 days) — acceptable.

5. **Resend sender domain.** `login@helpbase.dev` requires the `helpbase.dev` domain to be verified in Resend (SPF + DKIM). Takes ~10 min + a DNS change. Add as pre-merge prerequisite for PR 1.

6. **`@better-auth/cli generate` output format.** Better Auth recommends Drizzle but also supports raw SQL. If we add `drizzle-kit`, that's a new framework in the stack (innovation token?). Cheap alternative: use Better Auth's `generate --sql` flag and land a plain `.sql` migration, skip Drizzle entirely. Prefer plain SQL unless we hit friction.

7. **`trustedOrigins` list.** Must include every Vercel preview URL pattern, or preview deploys can't authenticate. Use `VERCEL_URL` env in the `trustedOrigins` array construction (dynamic).

8. **`deviceAuthorization` plugin's `client_id` semantics.** The docs use `"demo-cli"`. We need a stable one like `"helpbase-cli"`. Per the plugin, `client_id` is not a secret — it identifies the CLI to the user-facing page for display purposes.

9. **Session cookie vs bearer on the browser page.** Better Auth uses cookies by default on the browser. The device-flow approve endpoint reads the cookie session server-side. No token-in-body carriage needed.

10. **Rollback plan.** PR 1 rollback: revert the `_shared.ts` + `auth.ts` + CLI commits, keep the DB tables (they're additive — no data lost). PR 2 rollback: revert the `login.ts` commit; `helpbase login --email` still works. Both PRs are trivially revertable.

---

## NOT in scope (deferred)

- **2FA / passkeys.** Better Auth has `twoFactor()` and `passkey()` plugins. Skip for v1.
- **Delete Supabase `auth.users`.** Leave as a read-only backup for 30 days. Cleanup is a separate TODO.
- **Session introspection UI on helpbase.dev** (list devices / revoke). Needs a signed-in dashboard, which we don't have. Post-Vegard.
- **Phone-number / SMS magic link.** Supabase supports it; Better Auth has a `phoneNumber()` plugin; current users don't need it.
- **Migration of `llm_usage_events` user_id semantics.** They reference user IDs we're preserving — no migration needed. Flag if FK breaks during implementation.

---

## Success criteria (both PRs shipped)

**PR 1 alone (magic-link UX unchanged):**
- `helpbase login` with a fresh email creates a row in `public.user` (not `auth.users`).
- Resend delivers the sign-in email from `login@helpbase.dev`.
- `/api/v1/llm/generate-object` + `/generate-text` accept the Better Auth bearer token with no API shape change.
- Supabase `auth.users` row count is ≥ `public.user` row count (never fewer — migration is copy, not move).
- FK: `select llm_usage_events.user_id from llm_usage_events join public.user on public.user.id = llm_usage_events.user_id` works for all existing rows.
- `pnpm dlx create-helpbase@latest foo` with "Log in" branch picks up the new auth transparently.

**PR 2 additionally:**
- `helpbase login` fast path (cookied on helpbase.dev): under 10s end-to-end.
- User-code shown in both terminal + browser; docs/error messages tell user to compare them.
- `HELPBASE_LOGIN_NO_BROWSER=1` prints URL + user-code, polling still works.
- `helpbase login --email` runs the PR 1 magic-link-paste flow unchanged.
- `project_vegard_walkthrough.md` rewritten: "check your email" step deleted.

---

## DX SCORECARD

```
+====================================================================+
|              DX PLAN REVIEW — SCORECARD                             |
+====================================================================+
| Dimension            | Pre    | Post   | Δ      |
|----------------------|--------|--------|--------|
| Getting Started      | 8/10   | 9/10   | +1 ↑   |
| API/CLI/SDK          | 9/10   | 9/10   | —      |
| Error Messages       | 6/10   | 9/10   | +3 ↑   |
| Documentation        | 7/10   | 8/10   | +1 ↑   |
| Upgrade Path         | 8/10   | 9/10   | +1 ↑   |
| Dev Environment      | 8/10   | 9/10   | +1 ↑   |
| Community            | 6/10   | 6/10   | —      |
| DX Measurement       | 7/10   | 9/10   | +2 ↑   |
+--------------------------------------------------------------------+
| TTHW warm            | n/a    | ≤10s   | Champion |
| TTHW cold (OAuth)    | ~60s   | ≤20s   | Champion |
| TTHW cold (email)    | ~60s   | ≤75s   | Competitive |
| Competitive Rank     | Champion on warm + OAuth, Competitive on email |
| Magical Moment       | designed via copy-paste (create-helpbase)      |
| Product Type         | CLI Tool (primary) + Service (secondary)      |
| Mode                 | POLISH                                         |
| Overall DX           | 7.4/10 | 8.5/10 | +1.1 ↑ |
+====================================================================+
| DX PRINCIPLE COVERAGE                                               |
| Zero Friction      | covered (OAuth one-click cold path)            |
| Learn by Doing     | covered (scaffolder is the demo)               |
| Fight Uncertainty  | covered (6 error codes + /errors pages + hints)|
| Opinionated + Escape Hatches | covered (--email, NO_BROWSER env)    |
| Code in Context    | covered (scaffolder integration, not abstract) |
| Magical Moments    | covered (cited docs from user's repo)          |
+====================================================================+
```

**Prior DX trend on main:** 8/10 (2026-04-17 autoplan). This plan moves the auth surface from "acceptable friction" to "first-class" — it's the product's first-touch surface, so the +1.1 lift is high-leverage.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Scope decided by user + context7: library adoption over custom roll |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Skipped — revisit if PR 1 implementation surfaces unknowns |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | Pivoted from custom-device-flow to Better Auth; staged 2 PRs to de-risk migration + feature |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | One page + reused sign-in form; skipped |
| DX Review | `/plan-devex-review` | Developer experience gaps | 1 | CLEAR | 7.4 → 8.5, 3 gaps fixed: OAuth added (cold TTHW 60s→20s), Tier-3 error catalog (6 codes + docs + telemetry), progressive polling hints |

**UNRESOLVED:** —
**CRITICAL GAPS:** —
**VERDICT:** ENG + DX CLEARED — ready to implement after user approval. Awaiting the STOP gate.
