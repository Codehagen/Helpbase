# Contributing to helpbase

Thanks for considering a contribution. helpbase is young — small PRs are
welcome, and every bug report or feature request helps us land the right
product faster.

## Setup

```bash
git clone https://github.com/Codehagen/helpbase.git
cd helpbase
pnpm install
pnpm build
pnpm test       # full workspace: CLI + scaffolder + web
```

Requires Node 20+ and pnpm 9. The workspace uses turborepo — `pnpm dev`,
`pnpm build`, `pnpm test`, `pnpm typecheck`, and `pnpm lint` all proxy
through turbo so they run across every package.

## Project layout

```
apps/web/               The canonical help center UI (deployed to helpbase.dev)
packages/cli/           The `helpbase` CLI
packages/create-helpbase/  The `npx create-helpbase` scaffolder
packages/shared/        Schemas, AI helpers, screenshot pipeline
packages/ui/            Shared components
registry/               shadcn registry source (synced from apps/web)
```

## Canonical source + sync

`apps/web` is the single source of truth for the help center UI. The
scaffolder templates (`packages/create-helpbase/templates/`) and the shadcn
registry (`registry/helpbase/`) are both generated from it by
`pnpm sync:templates`. If you change a file in `apps/web`, rerun the sync
before committing — CI fails when they drift.

## Smoke tests

- `pnpm smoke` — end-to-end scaffolder smoke test (creates a project,
  installs, builds it).
- `pnpm smoke:install` — the install path only.
- `pnpm smoke:registry` — the `shadcn add` registry path.

Run these before shipping CLI or scaffolder changes.

## Commit style

Conventional commits: `feat(cli): ...`, `fix(scaffolder): ...`,
`chore: ...`, `docs: ...`. Reference TODOS in the commit body when a PR
closes one (e.g. `Closes TODO-009`).

## Pull requests

- One focused change per PR. If you're torn, split it.
- Run `pnpm typecheck && pnpm test && pnpm lint` before pushing.
- Include screenshots for UI changes, CLI output for CLI changes.
- Link the issue you're fixing, if any.

## Reporting bugs

The easiest path: run `helpbase feedback` — it pre-fills a GitHub issue
with your CLI version and OS. Or open one manually at
<https://github.com/Codehagen/helpbase/issues>.

## License

By contributing, you agree your contributions are licensed under the
AGPL-3.0-only license that covers the rest of the project.
