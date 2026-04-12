# Changelog

All notable changes to helpbase will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
