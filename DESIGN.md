# Design System — helpbase

> Reference doc. Describes what the product looks like today so future edits
> don't accidentally remodel it. Keep updates incremental and scoped.

## Product context

- **What:** Open-source help center with AI content generation. Guides, CLI reference, component docs.
- **Who:** Developers evaluating helpbase for their product's help center.
- **3x leverage:** `apps/web` is simultaneously the helpbase.dev site, the product demo, and the scaffold customers install via `npx create-helpbase` / `shadcn add`. Design changes here ship to every customer. Always run `pnpm sync:templates` after UI changes, and verify with `pnpm smoke:install` + `pnpm smoke:registry`.

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind v4 (`@tailwindcss/postcss`) with shadcn/ui primitives
- Geist Sans (body/UI) + Geist Mono (code) via `next/font/google`
- MDX via `next-mdx-remote/rsc` for article content
- `next-themes` for light/dark toggle

## Aesthetic

Clean, cool-neutral, developer-tool docs aesthetic. Minimal decoration. Strong typographic hierarchy. Pragmatic — nothing decorative earns its pixels.

## Color (from `packages/ui/src/styles/globals.css`)

Uses shadcn's default cool-neutral palette in oklch. The full token set is in `globals.css` — don't reinvent it. Key semantic tokens:

- `--background` / `--foreground` — page background + primary text
- `--muted` / `--muted-foreground` — surface fills, secondary text
- `--border` — hairline dividers, card outlines
- `--primary` — near-black in light mode; used for primary buttons and strong emphasis
- `--sidebar-*` — dedicated tokens for sidebar nav surfaces
- `.dark { ... }` — full dark-mode override

**Rule:** Always reference tokens (`bg-background`, `text-muted-foreground`, `border-border`). Never hardcode hex or oklch in components. If a color is missing, add it to `globals.css` first.

## Typography

- **Body + UI:** Geist Sans (`--font-sans`, loaded in `app/layout.tsx`)
- **Code + mono:** Geist Mono (`--font-mono`)
- **Headings:** Geist Sans at heavier weights (600–700) with negative letter-spacing

Article body styling lives in `.article-content` at the bottom of `globals.css`. Scale is handled inline in page components with standard Tailwind size utilities (`text-sm`, `text-4xl`, etc.).

## Layout

### Home page (`apps/web/app/(main)/page.tsx`)

- **Hero** — centered, bordered, with a subtle grid pattern + radial gradient background. h1 is "helpbase docs" (4xl→5xl). Supporting paragraph in muted. Search trigger below (`<SearchTriggerHero />`), max-w-md.
- **Categories** — section heading "Browse by category", 1/2/3-col responsive grid of cards. Each card has an icon in a `bg-muted` square (inverts to `bg-foreground` on hover), title, description, article count, and a chevron that slides on hover.
- **Popular articles** (only if `featured.length > 0`) — 1/2/3-col responsive list of article links with a small icon + title + 2-line description clamp.
- **Max content width:** `max-w-6xl` throughout.

### Docs pages (`apps/web/app/(main)/(docs)/`)

- **Layout** — flush-left sidebar (`DocsSidebar`, 240px, sticky) + article body. No TOC rail by default; the TOC component is in `components/toc.tsx` and is used per-article where needed. Content column capped at `xl:max-w-4xl`.
- **Category page** — breadcrumb, h1 with category title, description, then a vertical stack of article cards (rounded hover state, icon + title + one-line description + chevron).
- **Article page** — breadcrumb, `<article>` element, `.article-content` styled MDX body, Edit-on-GitHub link, prev/next navigation at the bottom.
- **Sidebar active state** — `bg-muted` background + small `bg-foreground` dot marker.

### Header (`apps/web/components/header.tsx`)

- Sticky top bar with `backdrop-blur-lg` and `bg-background/80`
- Left: "helpbase" wordmark (plain, no icon)
- Center: `<SearchTrigger />` (button that dispatches ⌘K)
- Right: theme toggle, GitHub icon link
- `max-w-6xl` container

## Search

- `<SearchDialog />` rendered once in `app/(main)/layout.tsx` with `items` prop from `getSearchIndex()`
- ⌘K or click on any `<SearchTrigger />` opens the modal
- Arrow keys navigate, Enter routes, Esc closes
- Hand-rolled (not cmdk) in `components/search-dialog.tsx` — keep it that way unless there's a specific reason to swap

## Motion

All animation tokens and keyframes live in `globals.css`. Respected by `prefers-reduced-motion`.

- `animate-fade-in` / `animate-fade-in-delay-1` / `animate-fade-in-delay-2` — staggered entrance on hero elements
- `animate-scale-fade-in` — search dialog entrance
- `toc-indicator` — sliding active indicator on the TOC (GPU-accelerated transform)
- Easing tokens: `--ease-out-quad`, `--ease-out-cubic`, `--ease-out-quart`, `--ease-in-out-quad` (Emil Kowalski's set)

Reduced-motion handler disables all entrance animations and clamps all transitions/animations to ~0ms.

## Voice & Copy

- Direct, utilitarian dev-tool voice. No marketing-speak.
- Hero copy: "helpbase docs" + "Open-source help center with AI content generation. Guides, CLI reference, and component docs."
- Section headings: descriptive ("Browse by category", "Popular articles"), not salesy.

## What NOT to change without discussion

- Color palette — stays cool-neutral shadcn-default. We previously tried a terracotta-on-warm-paper editorial direction (see `design/new-abandoned` branch) and reverted after A/B feedback.
- Display typography — stays Geist Sans. No serif display in headings.
- Hero composition — stays centered with the grid + radial gradient backdrop.
- 3-col category card grid — intentional. Not "AI-slop" in this product's context — it matches developer-tool docs conventions (Stripe, Vercel docs all use card grids for category navigation).
- Flush-left sidebar with `max-w-7xl` content cap was removed in commit 71060c8; sidebar is flush to viewport.

## Distribution

Whenever you change `apps/web` UI, run:

```bash
pnpm sync:templates       # propagate to scaffolder + registry
pnpm --filter web test    # unit tests
pnpm smoke:install        # verify `npx create-helpbase` still works
pnpm smoke:registry       # verify `shadcn add` still works
```

All four should pass before landing. CI enforces a `git diff --exit-code` after sync, so out-of-sync commits fail.

## History

- **2026-04-14:** Attempted full editorial-technical rebuild (terracotta accent, Instrument Serif hero, warm off-white paper palette). Reverted after qualitative A/B — the original cool-neutral dev-tool aesthetic tested better with target users. Rebuild preserved on `design/new-abandoned` branch in case we revisit individual pieces.
- **2026-04-13:** Sidebar moved flush-left (commit 71060c8). Content width capped per-route.
