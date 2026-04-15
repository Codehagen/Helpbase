# Installing helpbase via the shadcn registry

One command drops a full help center into any existing Next.js + shadcn/ui
project: sidebar nav, ⌘K search, MDX content pipeline, dark mode, sample
articles.

**You do NOT need to clone the helpbase repo for this.** Node + pnpm and a
clean directory is all you need — the registry is served from
[helpbase.dev/r/help-center.json](https://helpbase.dev/r/help-center.json)
over the public internet.

This doc walks end-to-end through creating a brand-new Next.js project,
running `shadcn init`, and installing helpbase from the live URL. Follow
it verbatim — every command below has been verified against the live
registry.

## Two install modes

**Mode 1 — by URL (simplest, no config):**

```bash
pnpm dlx shadcn@latest add https://helpbase.dev/r/help-center.json
```

**Mode 2 — by namespace (after one-time config):**

Add this to your project's `components.json`:

```json
{
  "registries": {
    "@helpbase": "https://helpbase.dev/r/{name}.json"
  }
}
```

Then install with the shorter syntax:

```bash
pnpm dlx shadcn@latest add @helpbase/help-center
```

Both produce the same result. Mode 1 is one-shot; Mode 2 is nicer if you're
going to pull multiple helpbase components (`@helpbase/help-center-search`,
`@helpbase/help-center-sidebar`, `@helpbase/help-center-toc`).

---

## Prerequisites

- Node 20+
- pnpm 9+ (npm and yarn work too — commands below show pnpm; substitute as needed)
- An existing Next.js 14+ project with Tailwind v4 and shadcn/ui initialized
  - If you don't have one, the quick start below creates a scratch project

---

## What gets installed

Running `shadcn add` against `help-center.json` drops these into your project:

**Files** (relative to your project root):

```
app/(docs)/layout.tsx                             # docs layout with sidebar
app/(docs)/[category]/page.tsx                    # category listing page
app/(docs)/[category]/[slug]/page.tsx             # article page (MDX rendering)
app/(docs)/helpbase-styles.css                    # scoped helpbase animations + article typography
components/header.tsx                             # top bar with wordmark + search + theme toggle
components/footer.tsx                             # minimal footer
components/docs-sidebar.tsx                       # left nav
components/mobile-sidebar.tsx                     # mobile drawer
components/search-dialog.tsx                      # ⌘K command palette
components/search-trigger.tsx                     # search button (opens palette)
components/theme-provider.tsx                     # next-themes wrapper
components/toc.tsx                                # scroll-spy table of contents
components/mdx/{accordion,callout,card-group,cta-card,figure,steps,tabs,video}.tsx
lib/assets.ts                                     # asset-path resolver for MDX figures/videos
lib/content.ts                                    # MDX loading + category walk
lib/mdx-components.tsx                            # component map for MDX pipeline
lib/schemas.ts                                    # Zod frontmatter schema
lib/search.ts                                     # search index builder
lib/slugify.ts                                    # URL slug helpers
lib/toc.ts                                        # TOC extraction from MDX
content/_category.json                            # root category metadata
content/getting-started/{_category.json,introduction.mdx}
content/customization/{_category.json,theming.mdx}
```

**npm dependencies** (added to your `package.json`):

- `next-mdx-remote`, `gray-matter`, `rehype-slug`, `remark-gfm` — MDX pipeline
- `next-themes` — dark mode toggle
- `zod` — frontmatter validation
- `lucide-react` — icons

**shadcn components pulled in as dependencies:**

- `badge`, `accordion`, `tabs`

**CSS vars written to `app/globals.css`** (light + dark mode sidebar tokens).

---

## Install walkthrough

### 1. Create a scratch Next.js project

Do this somewhere OUTSIDE the helpbase repo (you're simulating a real
customer's project).

```bash
cd /tmp
pnpm create next-app@latest helpbase-install-test \
  --typescript --app --tailwind --eslint \
  --src-dir=false --import-alias="@/*" --no-turbopack --use-pnpm
cd helpbase-install-test
```

Expected: `pnpm create next-app` scaffolds a minimal Next.js app, installs
dependencies, and leaves you in the new project directory.

### 2. Initialize shadcn/ui

```bash
pnpm dlx shadcn@latest init -d -y
```

- `-d` uses shadcn's default config
- `-y` skips prompts

Expected: creates `components.json`, wires `lib/utils.ts`, installs the
runtime shadcn dependencies (`class-variance-authority`, `clsx`, `tailwind-merge`,
`lucide-react`, `@radix-ui/react-slot`), and writes default CSS variables into
`app/globals.css`.

### 3. Install helpbase

Pick one of the two modes described at the top of this doc. For the first
install, the URL mode is simplest:

```bash
pnpm dlx shadcn@latest add https://helpbase.dev/r/help-center.json -y
```

Expected: shadcn fetches the JSON from helpbase.dev, installs the `badge`,
`accordion`, `tabs` shadcn components, installs the npm dependencies listed
above, writes all the files listed in "What gets installed," and merges the
helpbase sidebar CSS vars into `app/globals.css`.

No prompts should appear when using `-y`. If prompts do appear (e.g. "file
already exists, overwrite?"), that's something to flag — report the prompt text.

### 4. Build and run

```bash
pnpm build
```

Expected routes in the build output:

```
○ /
● /[category]
  ├ /getting-started
  └ /customization
● /[category]/[slug]
  ├ /customization/theming
  └ /getting-started/introduction
```

(The `/` route is your Next.js starter's home page — unchanged. Helpbase's
pages live under `/[category]/...`.)

Then:

```bash
pnpm dev
```

Open http://localhost:3000/getting-started/introduction — you should see the
sample article with a sidebar on the left, TOC on the right (wide viewports),
and the introduction article body in the middle.

### 5. Clean up

```bash
cd ..
rm -rf helpbase-install-test
```

---

## Verification checklist

For each item below, tick if it works in the scratch project you just built:

**Structural**

- [ ] `pnpm build` completed without errors
- [ ] All four content routes listed above appear in the build output
- [ ] `node_modules` contains `next-mdx-remote`, `next-themes`, `gray-matter`, `rehype-slug`, `remark-gfm`, `zod`, `lucide-react`
- [ ] `components/ui/` contains `badge.tsx`, `accordion.tsx`, `tabs.tsx`
- [ ] `app/globals.css` contains `--sidebar` CSS variable

**Dev behavior**

- [ ] `pnpm dev` starts without warnings beyond the usual Next.js output
- [ ] http://localhost:3000/getting-started — category listing renders with at least one article link
- [ ] http://localhost:3000/getting-started/introduction — article renders with rendered MDX headings, not raw markdown
- [ ] Left sidebar on article pages lists both categories ("Getting Started", "Customization")
- [ ] Clicking a sidebar link routes to the correct article
- [ ] ⌘K opens the search dialog
- [ ] Typing a keyword filters results; Enter routes to the article
- [ ] The customization/theming article renders its embedded components (accordion, tabs, callouts) correctly

**Dark mode**

- [ ] The `ThemeProvider` is wired in `app/(docs)/layout.tsx` (grep for `ThemeProvider`)
- [ ] If your starter's root layout wraps children in `ThemeProvider`, toggle dark mode and verify the docs routes respect it

**What the starter doesn't ship** (not a helpbase concern but worth noting):

- [ ] Home page at `/` is still the Next.js starter. helpbase installs docs pages under `/[category]`, not a replacement home page — customers wire the marketing home themselves.
- [ ] No theme toggle in the header by default. The installed `ThemeProvider` enables toggling; the customer adds the toggle button.

---

## Common issues to flag

1. **shadcn init writes different CSS variables than helpbase expects** — shadcn's defaults evolve. If `pnpm build` errors about a missing token or `text-muted-foreground`/`bg-sidebar` render wrong, the helpbase CSS vars in the install may not have merged correctly. Screenshot and share `app/globals.css`.

2. **`pnpm build` errors "Module not found: 'next-mdx-remote'"** — shadcn add didn't install the declared dependencies. Check `package.json`. Re-run `pnpm install`. If the dep is still missing, flag it.

3. **Article pages render as blank pages** — the MDX pipeline isn't wired. Check the terminal running `pnpm dev` for errors like "content/ directory not found" or "frontmatter validation failed."

4. **TOC on the right rail shows nothing** — the article's MDX may have no h2/h3 headings to extract. Try the longer `customization/theming` article.

5. **Search returns zero results** — `getSearchIndex()` couldn't walk `content/`. Check that `content/getting-started/introduction.mdx` and `content/customization/theming.mdx` exist in your scratch project. If they do, there's a bug in `lib/content.ts`.

---

## Alternative: one-command automated smoke

The above walkthrough is what a real user does. If you want a pass/fail signal
without clicking through anything:

```bash
# From inside the helpbase repo
pnpm smoke:registry
```

This builds a scratch Next.js project in `/tmp`, runs `shadcn init` + `shadcn
add`, builds it, and asserts the expected routes are present. Prints `✓
Registry smoke test passed` on success. If it fails, the scratch project is
kept at `/tmp/helpbase-registry-smoke-*` for inspection.

The automated path takes 60-120 seconds. The manual walkthrough takes 5-10
minutes but catches UX issues (confusing prompts, noisy warnings, weird
post-install state) the automated test doesn't see.

---

## If you find a bug

Capture and share:

1. **Which step failed** (e.g. "Step 4 — shadcn add")
2. **Full terminal output** (the command + everything it printed)
3. **Your pnpm version** (`pnpm --version`) and Node version (`node --version`)
4. **What `/tmp/helpbase-install-test` looks like** (the scratch project's state)

The faster we see the actual failure, the faster we can fix it.
