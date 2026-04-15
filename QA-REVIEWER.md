# QA — helpbase distribution channels

Thanks for testing. You're verifying that `npx create-helpbase` (npm) and
`shadcn add` (shadcn registry) both produce a working help center for real
users. **If either is broken, nobody can use the product** — so this is the
single most important test right now.

Target time: **30-45 minutes** including reads. If you're fast or skip the
optional branches, 20 min is plausible.

---

## Before you start

- **Repo:** `https://github.com/Codehagen/helpbase` (main branch)
- **Live preview:** https://helpbase.dev
- **What you need:** Node 20+, pnpm, git, ~2 GB free disk. No API keys required for any of this QA.
- **What you're NOT testing:** AI article generation (`pnpm smoke`). That's a separate smoke path, needs a Vercel AI Gateway key, and is explicitly out of scope for you.

Clone and install first:

```bash
git clone https://github.com/Codehagen/helpbase.git
cd helpbase
pnpm install
```

---

## Pass 1 — Run the dev server and dogfood the site (10 min)

```bash
pnpm --filter web dev
```

Open http://localhost:3000 and click through every visible link. Report:

- [ ] Home page renders without console errors
- [ ] Category pages (`/getting-started`, `/customization`, `/cli`, `/guides`, `/reference`) render
- [ ] At least one article page renders with MDX content (not a blank page)
- [ ] Sidebar on doc pages shows every category and lets you navigate
- [ ] TOC on long articles highlights the current section as you scroll
- [ ] ⌘K opens the search modal from any page
- [ ] Typing in search filters results; Enter routes to an article; Esc closes
- [ ] Theme toggle (top-right) switches light/dark without breaking anything

Browser sanity:

- [ ] Resize window to 375 px wide — no horizontal scrollbar, layout adapts
- [ ] Dark mode has adequate contrast (read any paragraph at arm's length)

Anything unexpected → **screenshot + URL + steps to reproduce.** Post in the
issue / DM / wherever we're collecting feedback.

---

## Pass 2 — npm scaffolder smoke (`create-helpbase`) (5 min)

This simulates what happens when someone runs `npx create-helpbase`.

```bash
pnpm smoke:install
```

Expected output ends with:

```
✓ Install smoke test passed
  Files:    65 scaffolded
  Routes:   5 verified
```

If it passes, the scaffolder still produces a working Next.js help-center app.
If it fails, the scratch output is kept at the `/tmp/helpbase-install-smoke-*`
path printed in the log — share that path or the build error.

**Bonus (optional):** manually walk the scratch project:

```bash
cd /tmp/helpbase-install-smoke-*     # path printed by smoke output
pnpm dev
# open http://localhost:3000 — should look identical to helpbase.dev
```

Flag any visual or behavioral diff between the scratch project and the repo's
`pnpm --filter web dev`.

---

## Pass 3 — shadcn registry smoke (`shadcn add`) (10 min)

This simulates what happens when someone runs `shadcn add helpbase/help-center`
in their own Next.js + shadcn project.

```bash
pnpm smoke:registry
```

Expected output ends with:

```
✓ Registry smoke test passed
```

If it passes, the shadcn install path still drops a working help center into
an arbitrary Next.js project. If it fails, the scratch project is kept at
`/tmp/helpbase-registry-smoke-*` — share the path or the build error.

**Bonus:** the scratch Next.js project is a real installation surface. `cd` in
and `pnpm dev`, poke around.

---

## Pass 4 — Unit tests + typecheck (2 min)

```bash
pnpm --filter web typecheck
pnpm --filter web test
```

Both should exit 0. Expect `Tests 30 passed (30)`.

---

## Pass 5 — Visual spot-check against production (5 min)

Open https://helpbase.dev in one tab and http://localhost:3000 in another.
Compare side-by-side:

- [ ] Home page hero matches (centered, grid-pattern backdrop, "helpbase docs")
- [ ] Category card grid looks identical (3-col on wide, icon-in-square, same text)
- [ ] Article pages have the same left sidebar, same typography
- [ ] Dark mode calibration matches

Any visual drift between local and production → flag it. Production is
`main` branch auto-deployed via Vercel, so they should be identical.

---

## What "found a bug" looks like

Good bug report:

> **Where:** Home page, at 375px width
> **What I expected:** Category grid collapses to 1 column
> **What I saw:** Cards overflow the viewport horizontally
> **Reproduce:** Open http://localhost:3000 in Chrome, DevTools → iPhone SE preset
> **Evidence:** [screenshot]

Bad bug report:

> "Looks weird on mobile"

---

## What to specifically look for

Real risk areas (places we haven't had a second pair of eyes on):

1. **Mobile nav** — the sidebar switches to a drawer below `lg`. Does the drawer button appear? Does it open cleanly? Does tapping a link close it?
2. **Search** — type in the search box. Does it filter live? Do arrow keys navigate? Does clicking a result route correctly? What happens with zero results?
3. **MDX rendering edge cases** — does an article with code blocks render the code correctly? Does an article with an embedded video show the embed (check the `customization/theming` article for the full component palette)?
4. **Dark mode** — toggle dark mode on the home page, then navigate to an article. Does the theme persist? Do any elements have poor contrast in dark?
5. **The scratch projects** (Pass 2+3 bonuses) — if either smoke test passes but the scratch project's `pnpm dev` looks broken, that's a silent failure we need to catch.

---

## After testing

Summary reply is enough. Something like:

> Pass 1 ✓ — found two issues, see attached
> Pass 2 ✓ passed
> Pass 3 ✓ passed
> Pass 4 ✓ all green
> Pass 5 ✓ match
> Verdict: ship-ready / not yet (list of blockers)

Thank you!

---

## Reference — what's in the repo

- `apps/web/` — canonical help-center UI (the site at helpbase.dev)
- `packages/create-helpbase/` — the `npx create-helpbase` scaffolder CLI
- `packages/helpbase/` — the `helpbase` CLI (content generation, etc.)
- `packages/ui/` — shared shadcn-based UI primitives and `globals.css`
- `packages/shared/` — types + schemas
- `registry/helpbase/` — standalone tree shipped via shadcn registry (synced from `apps/web`)
- `DESIGN.md` — source of truth for visual direction (read this if you want context on design choices)
- `SMOKE.md` — longer description of the smoke tests if you want to dig deeper
