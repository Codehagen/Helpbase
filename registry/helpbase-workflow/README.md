# helpbase-workflow

Drop-in GitHub Actions workflow that runs `helpbase sync` on a schedule and
on every push to your main branch. When a code change would make an MDX
doc wrong, the workflow opens a PR with the proposed update, grounded in
citations into your source.

No SaaS in the path. Runs in your Actions minutes, reads your secrets,
writes to your repo.

## Install

```bash
npx shadcn add https://helpbase.dev/r/helpbase-workflow.json
```

That drops a single file into your repo:

```
.github/workflows/helpbase-sync.yml
```

## Configure

Add one secret to your GitHub repo (**Settings → Secrets and variables →
Actions → New repository secret**). You have two options:

- **`AI_GATEWAY_API_KEY`** (recommended for CI) — your key from
  [vercel.com/ai-gateway](https://vercel.com/ai-gateway). Bypasses helpbase's
  hosted proxy entirely. Your Gateway account, your bill, no daily quota
  limit. See [helpbase.dev/docs/byok](https://helpbase.dev/docs/byok).
- **`HELPBASE_TOKEN`** — a helpbase session access token. After running
  `helpbase login` locally, pull the value from `~/.helpbase/auth.json`:
  `jq -r .access_token ~/.helpbase/auth.json`. Uses helpbase's hosted proxy
  and the free-tier 500k tokens/day cap. Note: session tokens are relatively
  short-lived — rotate the secret when it expires.

If both are set, `AI_GATEWAY_API_KEY` wins (BYOK mode).

`GH_TOKEN` is read from `github.token` automatically, so you don't need
to provision it manually.

## Customize

The workflow ships with sensible defaults you'll likely want to tweak:

- **Schedule** — default is Monday 09:00 UTC (`cron: "0 9 * * 1"`). Edit
  the `cron` line to match when your team starts the week.
- **Base branch** — default assumes `main`. Change both `branches: [main]`
  under `push:` and `--since origin/main` in the run step if you use
  `master`, `trunk`, or something else.
- **Content directory** — default assumes `content/`. If your docs live
  elsewhere, append `--content docs/` to the `helpbase sync` command.

## What the PR looks like

Every edit in the generated PR carries a `citations` trailer pointing at
specific lines of source code that justified the change. Review those
citations first — if a citation is missing or wrong, reject the PR; the
schema makes this rare but not impossible.

## Run locally

To preview what the workflow would propose, run the same command on your
machine:

```bash
AI_GATEWAY_API_KEY=your_key_here \
  npx helpbase sync --since origin/main --dry-run
```

Drop `--dry-run` when you're ready to see the real proposals.
