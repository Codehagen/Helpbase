# helpbase

This is your help center. It ships with working content so you can see the
full layout right away. Keep what you need, delete the rest, write your own.

## Where things live

```
content/
  <category>/
    _category.json        → category metadata (title, icon, order)
    <article>.mdx         → one article, with frontmatter + MDX body
    <article>/            → optional asset directory (images, video)
      hero.png
```

Every `.mdx` file in a category becomes an article. Every subdirectory in
`content/` becomes a category. No config files to update when you add or
remove content — helpbase picks it up.

## Frontmatter contract

Every article starts with a block like this:

```yaml
---
schemaVersion: 1
title: "Reset your password"
description: "How to reset your password from the login screen"
tags: [account, security]
order: 1
featured: false
---
```

Required: `schemaVersion`, `title`, `description`. Optional: `tags`, `order`,
`featured`, `heroImage`, `videoEmbed`. The build fails if anything is wrong
— run `helpbase audit` to see what's missing.

## Common workflows

```bash
pnpm dev                                          # local preview on :3000
helpbase new                                       # scaffold an article (interactive; 4 templates)
helpbase generate --url https://yoursite.com       # AI-generate articles
helpbase audit                                    # catch broken content
helpbase deploy                                    # go live on helpbase.dev
helpbase open                                      # open the live site
```

## Going live

`helpbase deploy` takes care of it — magic-link login, pick a subdomain,
and your help center is live at `your-slug.helpbase.dev`. The first deploy
writes `.helpbase/project.json` with the tenant binding. Commit that file
so teammates deploy to the same tenant.

For CI: set `HELPBASE_TOKEN` and pass `--slug` to skip every prompt.

## When things break

Every CLI error carries a code and a URL. When you see something like:

```
✖ Subdomain is taken [E_SLUG_TAKEN]
  fix:   Pick another
  docs:  https://helpbase.dev/errors/e-slug-taken
```

Follow the docs link. If the fix doesn't match reality, open an issue with
`helpbase feedback` — it pre-fills a GitHub issue with your CLI version
and OS.

## Full reference

`helpbase <command> --help` for any command. Full reference:
<https://helpbase.dev/docs/cli>.
