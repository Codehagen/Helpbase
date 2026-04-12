# Content schema

Every article in `content/` has a YAML frontmatter block validated at build
time by `frontmatterSchema` in `packages/shared/src/schemas.ts`. The
`schemaVersion` field tells helpbase which version of that contract the file
was authored against.

## Current version: 1

```yaml
---
schemaVersion: 1
title: "Your article title"
description: "One-line summary shown in search + category cards"
tags: []
order: 1
featured: false
---
```

Required: `schemaVersion`, `title`, `description`. Optional: `tags`, `order`,
`featured`, `heroImage`, `videoEmbed`. The CLI emits v1 frontmatter when you
run `helpbase new` or `helpbase generate`.

## How migrations will work

When the schema changes in a breaking way (say, renaming `featured` to
`pinned`), we bump `schemaVersion` to 2 and ship a codemod:

```bash
npx helpbase migrate --to 2
```

The codemod rewrites every `.mdx` under `content/` in place, commits nothing,
and exits non-zero if anything fails so CI catches it. You review the diff
like any other refactor.

## Promise

- `schemaVersion` only bumps for **breaking** changes — field renames, type
  changes, removed fields. Adding optional fields is always non-breaking and
  stays on the current version.
- Every bump ships with a migration guide in `CHANGELOG.md` and a codemod.
- We keep the previous version's parser around for at least one minor
  release after the bump, so a repo that hasn't migrated yet still deploys.
- `helpbase audit` warns when it sees a `schemaVersion` the installed CLI
  doesn't know how to parse, pointing at the upgrade path.

## Why not SemVer on the CLI?

CLI versions track CLI behavior (new commands, bug fixes, breaking CLI
surface changes). `schemaVersion` tracks the data format. The two move
independently — a minor CLI bump can add `helpbase doctor` without touching
frontmatter, and a schema bump can happen in a major CLI release. Keeping
them separate means content files never have to know what CLI version wrote
them.
