# helpbase-workflow

Drop-in GitHub Actions workflow that runs `helpbase sync` on a schedule and
on every push to your main branch. When a code change would make an MDX
doc wrong, the workflow opens a PR with the proposed update, grounded in
citations into your source.

Zero config. No secrets to set. Auth happens via GitHub Actions OIDC.

## Install

```bash
npx shadcn add https://helpbase.dev/r/helpbase-workflow.json
```

That drops a single file into your repo:

```
.github/workflows/helpbase-sync.yml
```

Push the workflow. First scheduled run (or push to `main`) triggers it.
That's it.

## One-time setup: let Actions open PRs

GitHub's default setting blocks Actions from opening pull requests. If
you don't flip this once, helpbase will still push a branch with the
proposed docs update on every run, but won't open the PR for you — you'll
see a warning in the Action log pointing at the branch URL to open it
manually.

To enable auto-PR, visit:

```
Settings → Actions → General → Workflow permissions
  [x] Read and write permissions
  [x] Allow GitHub Actions to create and approve pull requests
```

Or via the CLI:

```bash
gh api --method PUT repos/{owner}/{repo}/actions/permissions/workflow \
  -F default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```

For org-owned repos, this might already be set at the organization level.

## How the auth works

When the action runs, GitHub mints a short-lived JSON Web Token that
identifies which repository is calling. The workflow passes that token
to the helpbase backend, which verifies it against GitHub's public keys
and allocates quota to your repository. Per-repo free tier is 500,000
tokens/day, reset at UTC midnight. Quota is keyed on the GitHub numeric
`repository_id`, so it follows the repo across renames and org transfers.

No token is stored on your side. Each CI run mints a fresh one scoped to
this workflow, valid for ~6 minutes, bound to this specific repo.

## BYOK override

If you'd rather use your own LLM provider account (unlimited, your bill,
your choice of model routing), set any of these as a repo secret:

- `AI_GATEWAY_API_KEY` — Vercel AI Gateway
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`

When any of these is set, the CLI skips the helpbase proxy entirely and
calls your provider directly. First env var wins.

## Customize

The workflow ships with sensible defaults you'll likely want to tweak:

- **Schedule** — default is Monday 09:00 UTC (`cron: "0 9 * * 1"`). Edit
  the `cron` line to match when your team starts the week.
- **Base branch** — default assumes `main`. If you use `master`, `trunk`,
  or something else, update `branches: [main]` under `push:`. The diff
  baseline (`--since`) uses `github.event.before` on push events, so no
  other branch-name reference needs to change.
- **Content directory** — zero-config for the three common MDX layouts:
  `content/` (flat), `content/docs/` (MDX-in-subfolder), and
  `apps/web/content/` (monorepo). `helpbase sync` walks up from the
  repo root and picks the first match. If your docs live elsewhere,
  append `--content <path>` to the `helpbase sync` command, or set
  `HELPBASE_CONTENT_DIR` in the job's env.

## What the PR looks like

Every edit in the generated PR carries a `citations` trailer pointing at
specific lines of source code that justified the change. Review those
citations first — if a citation is missing or wrong, reject the PR; the
schema makes this rare but not impossible.

## Run locally

To preview what the workflow would propose, run the same command on your
machine:

```bash
# With your own key:
AI_GATEWAY_API_KEY=your_key_here \
  npx helpbase sync --since origin/main --dry-run

# Or with your logged-in session:
helpbase login
npx helpbase sync --since origin/main --dry-run
```

Drop `--dry-run` when you're ready to see the real proposals.

## Upgrading from v0.7 or earlier

Earlier versions of this workflow required you to set `HELPBASE_TOKEN` or
`AI_GATEWAY_API_KEY` as a repo secret. v0.8+ uses GitHub OIDC by default
and no secret is needed.

To upgrade: re-run `npx shadcn@latest add https://helpbase.dev/r/helpbase-workflow.json`.
It overwrites the YAML. Then go to `Settings → Secrets and variables →
Actions` and delete `HELPBASE_TOKEN` if you set it before — it's no
longer read by the workflow.
