# helpbase deploy action

GitHub Action that deploys a [helpbase](https://helpbase.dev) help center
on every push to `main`.

## Quick start

```yaml
name: Deploy help center
on:
  push:
    branches: [main]
    paths: [content/**]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - uses: Codehagen/helpbase/.github/actions/deploy@main
        with:
          token: ${{ secrets.HELPBASE_TOKEN }}
```

The first deploy needs a `slug`. After that, `.helpbase/project.json` is
committed and subsequent deploys skip the prompt.

```yaml
- uses: Codehagen/helpbase/.github/actions/deploy@main
  with:
    token: ${{ secrets.HELPBASE_TOKEN }}
    slug: acme-docs   # only needed on first deploy
```

## Inputs

| Input               | Required | Default    | Description                              |
| ------------------- | -------- | ---------- | ---------------------------------------- |
| `token`             | yes      | —          | `HELPBASE_TOKEN` — mint one with `helpbase login` locally, then copy from `~/.helpbase/auth.json`. |
| `slug`              | no       | —          | Tenant subdomain (first deploy only). |
| `content-dir`       | no       | `content`  | Where your `.mdx` articles live.      |
| `working-directory` | no       | `.`        | Where to run the deploy from.         |
| `cli-version`       | no       | `latest`   | Pin a specific helpbase CLI version.  |

## Future plans

This action lives inside the helpbase monorepo today. When it stabilizes
we'll publish it as a standalone `Codehagen/helpbase-deploy-action`
marketplace action with the same inputs — existing workflows just need
to change the `uses:` path.
