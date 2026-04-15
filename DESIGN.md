# Design System — helpbase

> Status: APPROVED · 2026-04-14 · Created via `/design-consultation`
> Preview: `/tmp/helpbase-design-preview/index.html` (regenerate locally)

## Product Context
- **What this is:** Open-source help center with AI content generation. Guides, CLI reference, component docs.
- **Who it's for:** Developers evaluating help-center options, arriving via shadcn's promotion. Visually discerning, one click from Mintlify.
- **Space/industry:** Dev tools / docs-as-a-service. Peers: Mintlify, Vercel Docs, Stripe Docs, Dub.co help, shadcn/ui docs.
- **Project type:** Hybrid — marketing/landing + docs/help articles, same codebase.
- **3x leverage:** `apps/web` is simultaneously the marketing site, product demo, and scaffold every customer installs via `npx create-helpbase` / `shadcn add`. Design decisions ship to every customer.

## Aesthetic Direction
- **Direction:** Editorial Technical. Reads like a thoughtful publication, not a SaaS dashboard.
- **Decoration level:** Minimal. No decorative blobs, no gradient backgrounds, no icon-in-colored-circle grids. Optional subtle paper-grain texture on backgrounds.
- **Mood:** Warm, typographic, considered. A developer should think "this has taste" in the first 2 seconds.
- **Reference energy:** Stripe Press × Vercel Docs × a well-designed magazine. Deliberately NOT Mintlify, NOT shadcn/ui docs.

## Typography

Fonts loaded from Google Fonts via `next/font`. No custom licenses, ships cleanly in the scaffold.

- **Display (h1, hero, section headings):** Instrument Serif, 400 regular + italic. Editorial, unusual in dev tools, signals content craft. Use italic for emphasis in display text.
- **Body + UI:** Geist Sans. Weights used: 400, 500, 600, 700. Distinctive, not overused like Inter.
- **Code + data (tabular-nums):** Geist Mono. Weights: 400, 500. Pairs with Geist Sans.
- **Never use:** Inter, Roboto, Arial, Helvetica, Open Sans, Lato, Montserrat, Poppins (blacklist/overused).

### Scale

```
display-xl  56px / 60px  (Instrument Serif, letter-spacing: -0.02em)
display     40px / 46px  (Instrument Serif, letter-spacing: -0.01em)
h1          28px / 36px  (Geist 600, letter-spacing: -0.01em)
h2          20px / 28px  (Geist 600)
h3          17px / 24px  (Geist 600)
body        16px / 26px  (Geist 400, line-height 1.6)
small       13px / 18px  (Geist 400, muted by default)
label       12px / 16px  (Geist 500, uppercase, letter-spacing: 0.06em)
mono        13px / 20px  (Geist Mono 400)
```

### Typography rules

- Display (Instrument Serif) is used for marketing hero, section headings, and **article h1** only. Not for h2+ inside articles.
- Italic accents in display headings are encouraged (e.g., "Help your users *find answers.*").
- Article body uses Geist Sans for readability.
- Tabular numbers: enable `font-variant-numeric: tabular-nums` on Geist Sans anywhere numbers align in columns (pricing, stats, CLI output).

## Color

**Approach:** Restrained. One accent, used sparingly. Warm neutrals everywhere else.

### Light mode

```
--bg            #FAF9F6   warm off-white, paper-like (NOT pure white)
--surface       #F5F4F0   slightly elevated neutral
--text          #1C1917   warm near-black (stone-900)
--muted         #78716C   warm gray (stone-500)
--border        #E7E5E4   subtle
--border-strong #D6D3D1   inputs, strong dividers
--accent        #C2410C   terracotta/burnt orange
--accent-hover  #9A3412   accent darker state
```

### Dark mode

```
--bg            #0C0A09   warm near-black (stone-950)
--surface       #1C1917   slightly raised surface
--text          #FAFAF9   warm off-white
--muted         #A8A29E   warm light gray
--border        #292524   subtle
--border-strong #44403C   inputs
--accent        #EA580C   brighter terracotta for dark mode
--accent-hover  #F97316   hover state
```

### Semantic

```
--success  #166534 light / #22C55E dark
--warning  #A16207 light / #EAB308 dark
--error    #B91C1C light / #EF4444 dark
--info     #1E40AF light / #3B82F6 dark   (reserved; avoid in default UI)
```

### Color rules

- **Accent is rare.** Used only on: primary buttons, inline links inside article bodies, active TOC items, active sidebar item, focus rings. Not on icons. Not on cards. Not on section headings.
- **No blue as a primary color** — reserved for semantic info states only.
- **No purple, no violet, no indigo** anywhere. Including gradients.
- **No gradients** on buttons, backgrounds, or decorative elements. Period.
- Dark mode is not "invert the light palette." Surfaces get lifted; accent brightens by ~1 step to maintain contrast on dark bg.

## Spacing

**Base unit:** 4px. Scale uses multiples of 4.

```
2xs  2px
xs   4px
sm   8px
md   16px
lg   24px
xl   32px
2xl  48px
3xl  64px
4xl  96px
5xl  128px
```

**Density:** Comfortable to spacious. Generous for reading. Article body max-width **680px** (~65 characters).

## Layout

**Approach:** Hybrid.

- **Marketing/home page:** Centered search-first hero, then vertically stacked full-width sections (Popular Articles, then Categories, then Still-Need-Help CTA). Inspired by dub.co/help layout with helpbase editorial typography. See Approved Mockups below.
- **Docs/article pages:** Grid-disciplined. Sidebar (240px) + article body (680px max) + TOC (208px) on xl+. Predictable, fast to scan.
- **Category page:** Typographic list of articles. Not cards.

### Home page layout (approved 2026-04-14)

Top-to-bottom, each section full-width within `max-w-5xl`, stacked vertically (never side-by-side):

1. **Top bar:** `helpbase` wordmark in terracotta on the left, `Docs · GitHub` ghost text links on the right. Hairline border below.
2. **Hero (centered):** Small monochrome icon (`?` or similar), then Instrument Serif headline "How can we help today?" (~44px), supporting sans line, then prominent search input with ⌘K chip. 96px vertical padding.
3. **Popular Articles section (full-width):** `POPULAR ARTICLES` label in Geist Mono uppercase muted. Below: 2-3 column grid of article titles, each row shows title + right-arrow, no descriptions, no icons. Hairline dividers.
4. **Categories section (full-width, BELOW popular articles):** `BROWSE BY CATEGORY` label. Below: 3-column grid of category cards (4 on wider viewports). Each card has small monochrome line icon (top-left, never in colored box/circle), category title in Geist Sans 16/600, 2-line description in Geist Sans 13px muted. Card has hairline border, rounded-lg, surface background `#F5F4F0`.
5. **Still Need Help CTA:** Rounded surface block, centered content, small chat icon, "Still need help?" in Instrument Serif 24px, supporting line, solid terracotta "Contact support" button + ghost "View on GitHub".

**Rule:** Popular Articles and Categories are NEVER beside each other. Stacked vertically, full-width each.

### Grid

- Max content width (marketing): `max-w-5xl` = 1024px
- Max content width (article reading): 680px
- Gutter: 32px on desktop, 24px on mobile

### Border radius

```
sm    4px   subtle (badges, kbd chips)
md    6px   default inputs, small buttons
lg    8px   cards, larger buttons, inputs
xl    12px  hero elements, prominent cards
full  9999px  pills, avatars
```

**Radius rule:** No uniform bubbly radius on everything. Buttons and cards share `lg` (8px), but badges and kbd chips stay crisp at `sm` (4px). Hero imagery uses `xl` (12px). This hierarchy matters — uniform radius is an AI-slop signal.

## Motion

**Approach:** Intentional, not expressive. Motion budget: 2-3 intentional motions per page.

### Easing

```
ease-out      cubic-bezier(0.16, 1, 0.3, 1)    enter, reveal
ease-in       cubic-bezier(0.4, 0, 1, 1)       exit, dismiss
ease-in-out   cubic-bezier(0.4, 0, 0.2, 1)     move, morph
```

### Duration

```
micro    100ms   color, opacity hovers
short    200ms   underline slide, focus ring
medium   300ms   entrance fade-up, dropdown
long     500ms   page-level entrance, scroll-linked TOC
```

### Allowed motions

- **Entrance:** fade-up 20px over 300ms ease-out on first paint for hero elements. One pass, then static.
- **Scroll-linked:** TOC active item highlights as section crosses viewport midpoint. Smooth scroll on anchor click.
- **Hover:** Inline article links get a subtle underline slide-in (200ms). Buttons get a background color fade (150ms).
- **Focus:** 3px accent-tinted ring at 15% opacity, 150ms.

### Banned motions

- Bouncy springs. No overshoot.
- Decorative floaters (blobs drifting, particles).
- Auto-playing carousels.
- Hover lift effects on cards (`translateY(-4px)`). Too SaaS-template.
- Any animation longer than 700ms.

### Reduced motion

`@media (prefers-reduced-motion: reduce)` — all entrance animations and hover slides disabled. Scroll-linked TOC stays (functional, not decorative).

## Voice & Copy

- **Tone:** Direct, helpful, no marketing-speak. Match Garry Tan / Basecamp voice.
- **Hero headlines:** Short, use italic for emphasis. ("Help your users *find answers.*") No "Unlock the power of…", no "Welcome to…".
- **Section headings:** Declarative. "Everything, organized." not "Our comprehensive categorization system."
- **Button copy:** Verbs, not nouns. "Get started" not "Get started now!". "View on GitHub" not "GitHub →".
- **Article lede:** One sentence summarizing what the reader learns. Written in Geist at 18px, muted color.

## Interaction States

Every interactive component specifies what the user sees across states. Empty states are features, not afterthoughts.

### Search (⌘K palette)

| State | What the user sees |
|-------|--------------------|
| Idle  | Input with placeholder "Search articles…" + ⌘K chip |
| Focused | Border color shifts to terracotta, 3px accent ring at 15% opacity, placeholder dims |
| Typing | Search palette opens as a modal (centered, max-w-2xl, #FAF9F6 surface with 12px radius, `box-shadow: 0 8px 32px rgba(28,25,23,0.12)`). Results stream in below input grouped by section (Articles, Categories, CLI commands) with Geist Mono section labels |
| Loading | Subtle 150ms fade-in on results, no spinner |
| Empty results | Centered copy "No results for *[query]*." + small Geist Mono muted line "Try a different search or [browse all articles →]." Link in terracotta |
| Error | Same modal, Geist Sans line "Search is down. Check your network, or [browse all articles →]." No stack trace |
| Keyboard | ↑/↓ navigate, Enter opens, Esc closes. Active result has terracotta left border |

### Category card grid (home)

| State | What the user sees |
|-------|--------------------|
| Default | Hairline border, #F5F4F0 surface, thin monochrome icon top-left |
| Hover | Border strengthens to `#D6D3D1`, tiny right-arrow appears in terracotta, background stays |
| Focus (keyboard) | 3px terracotta ring at 15% opacity on the card |
| Empty (zero categories) | Single line: "No categories yet. Run `helpbase generate` to create your first article." with inline mono code styling |

### Popular articles list (home)

| State | What the user sees |
|-------|--------------------|
| Default | Title + right-arrow per row, hairline dividers |
| Hover | Title shifts to terracotta, arrow slides 2px right over 200ms |
| Empty | "Nothing popular yet. New help centers start quiet. [Browse all articles →]" |

### Article page body

| State | What the user sees |
|-------|--------------------|
| Default | Article content with terracotta inline links |
| Loading (SSR-first, rare) | Skeleton lines for h1 + lede, 3 blocks of body shimmer |
| 404 | Instrument Serif 48px "Not found." + line "This article moved or never existed. [Browse all articles →]" |
| Broken asset (image/video) | Hairline placeholder box with small mono caption "Image failed to load." Do not break layout |

### Rule

If you build a component that is not in this table, add a row before shipping. No component reaches production without an empty state and an error state documented.

## Search UX

The ⌘K search is a **modal command palette**, not an inline expansion.

- Trigger: clicking the hero search input, pressing ⌘K anywhere, or pressing `/`
- Implementation: `cmdk` library (shadcn-compatible) behind a Radix Dialog
- Modal: centered, max-w-2xl, `#FAF9F6` surface, rounded-xl, shadow as above
- Scrim: `rgba(12,10,9,0.4)` behind the modal (warm near-black, not pure black)
- Groups: `Articles`, `Categories`, `CLI commands` (future: Components). Each group header in Geist Mono 11px uppercase muted
- Client-side index: MiniSearch or FlexSearch over article frontmatter + body text. No server round-trip
- Opens in ≤100ms. Closes on Esc, scrim click, or Enter
- Route on selection: articles → `/[category]/[slug]`, categories → `/[category]`, CLI → opens article anchor
- Recent searches: persist last 5 in localStorage, show as "Recent" group when input is empty

## Responsive Behavior

Breakpoints (Tailwind defaults): `sm 640 md 768 lg 1024 xl 1280 2xl 1536`.

### Home page

| Viewport | Behavior |
|----------|----------|
| `< 640 (mobile)` | Hero centered, headline drops to 32px. Search input full-width with 16px gutter. Category grid collapses to **1 column**. Popular articles collapses to 1 column. Still-need-help block stacks button on its own line. No sidebar (not applicable on home) |
| `640-1023 (tablet)` | Headline 36px. Category grid **2 columns**. Popular articles 2 columns |
| `1024-1279 (desktop)` | Full layout. Category grid **3 columns**. Popular articles 2 columns |
| `≥ 1280 (xl)` | Category grid **4 columns**. Content max-w-5xl (1024px). |

### Article page

| Viewport | Behavior |
|----------|----------|
| `< 640` | No left sidebar (replaced by bottom sheet trigger). No right TOC. Article body full-width with 16px gutter, max-w 100%. Font size stays 16px body / 32px h1 |
| `640-1023` | Left sidebar hidden behind hamburger. No TOC. Article centered, max-w 680px |
| `1024-1279` | Left sidebar (240px, sticky). Article 680px max. No TOC yet |
| `≥ 1280` | Left sidebar + article + right TOC (208px) |

### Category page

| Viewport | Behavior |
|----------|----------|
| `< 1024` | No sidebar. Full-width article list. Header stacks |
| `≥ 1024` | Left sidebar + content. Article list stays single-column vertical (rows, not cards side-by-side) |

### Rule

**Responsive is not "stack on mobile."** Each breakpoint gets intentional layout. Never ship "we'll see how it looks" — if you don't know how section X behaves at 375px, you haven't designed it yet.

## Accessibility

Ship-blocking requirements:

### Keyboard

- Every interactive element is reachable with Tab; order matches visual order
- Skip-to-content link at the top of every page, visible on focus
- `⌘K` opens search from anywhere. `/` also opens search when no input is focused. `Esc` closes any modal
- Article page: `h` and `l` (Vim-style) go to prev/next article when no input is focused
- TOC: `j`/`k` step through sections. Enter jumps

### Focus indicators

- 3px ring in terracotta at 15% opacity, 2px offset from element
- Never remove `:focus-visible` styles. Use `outline: none` only when replacing with a ring
- Focus ring persists through hover transitions

### ARIA landmarks

- Top bar: `<header role="banner">`
- Sidebar nav: `<nav aria-label="Documentation">`
- TOC: `<nav aria-label="On this page">`
- Search modal: `role="dialog" aria-modal="true" aria-labelledby="search-title"` with visually-hidden title
- Article body: `<main>`
- Footer: `<footer role="contentinfo">`

### Screen reader text

- Icons are decorative — `aria-hidden="true"`. If an icon is the only content, add visually-hidden text label
- Code blocks: `<pre><code>` with language attribute. "Copy" button has `aria-label="Copy code"`
- Breadcrumb: `<nav aria-label="Breadcrumb"><ol>…` with separators as decorative
- Search results announce count: `aria-live="polite"`, "5 results for 'deploy'"

### Touch targets

- Minimum 44×44px touch area on mobile (padding counts toward target)
- Spacing between adjacent tap targets: 8px minimum
- `⌘K` chip and arrow indicators meet this via hit-box padding, even if visible footprint is smaller

### Color contrast

- Body text on background: ≥ 4.5:1 (WCAG AA). Verified: `#1C1917` on `#FAF9F6` = 14.8:1 ✓
- Muted text: ≥ 4.5:1. Verified: `#78716C` on `#FAF9F6` = 4.5:1 ✓ (at the limit — do not darken bg)
- Terracotta on warm white: ≥ 4.5:1 for link text. Verified: `#C2410C` on `#FAF9F6` = 5.1:1 ✓
- Dark mode terracotta: `#EA580C` on `#0C0A09` = 6.3:1 ✓

### Motion

- Every entrance/hover animation respects `prefers-reduced-motion: reduce`
- Scroll-linked TOC highlight is not an animation — it's a state change. Stays on for reduced-motion users

## Anti-Slop Blacklist

These patterns are banned in helpbase's design. Any PR that introduces one should be flagged in review:

1. 3-column feature grid with **icon-in-colored-circle**. (Category card grid IS allowed on the home page — but icons must be thin-stroke monochrome, never in a colored box or circle.)
2. ~~Centered hero on the home page~~ **REVISED 2026-04-14:** The home page hero IS centered (dub-inspired search-first layout). The ban is on *Mintlify-style blue-gradient centered hero* — our centered hero uses Instrument Serif on warm paper, which reads editorial not SaaS.
3. Purple/violet/indigo anywhere
4. Gradient backgrounds on hero or sections
5. Emoji as design decoration (allowed inline in article prose)
6. Decorative blobs, floating circles, wavy SVG dividers
7. Cards with colored left borders
8. "Unlock the power of…" / "Welcome to…" / "Your all-in-one…" copy patterns
9. Uniform large border-radius on every element
10. Blue as a primary accent (reserved for semantic info only)

## Decisions Log

| Date       | Decision                                      | Rationale |
|------------|-----------------------------------------------|-----------|
| 2026-04-14 | Initial design system created                 | Via `/office-hours` + `/design-consultation`. Supersedes implicit shadcn defaults. Strategic bet on editorial-technical identity to stand out in shadcn promotion wave. |
| 2026-04-14 | Terracotta `#C2410C` as sole accent           | Nobody in dev-docs category uses warm orange. Differentiates vs. Mintlify/Vercel/Stripe blue palette. |
| 2026-04-14 | Instrument Serif for display                  | Only dev-tools product using serif display. Reads "publication," not "template." Pairs with AI-generated-content narrative. |
| 2026-04-14 | Warm off-white `#FAF9F6` background           | Paper-like mood reinforces editorial direction. Differentiates vs. pure-white competitors. |
| 2026-04-14 | Geist + Geist Mono for body + code            | Not Inter (overused). Distinctive, free, tabular-nums supported. |
| 2026-04-14 | Motion budget 2-3 per page, no springs        | Intentional motion, not expressive. Respects reduced-motion day-one. |
| 2026-04-14 | Home layout: dub-inspired vertical stack       | Via `/design-shotgun` 8-variant exploration. User ranked H highest after iteration: centered search-first hero → Popular Articles (full-width) → Categories (full-width below) → Still-Need-Help CTA. Supersedes initial "asymmetric editorial masthead" direction. |
| 2026-04-14 | Search is a `⌘K` modal command palette        | Not an inline expansion. Hero input triggers the same palette as the keyboard shortcut. Client-side index (MiniSearch/FlexSearch) for ≤100ms open. Groups: Articles, Categories, CLI commands. |
| 2026-04-14 | Interaction states + a11y + responsive locked | Via `/plan-design-review`. Every component has empty/loading/error states documented. Keyboard shortcuts specified (⌘K, `/`, `h`/`l`, Esc). WCAG AA contrast verified on all text. Responsive breakpoints per section. |

## Approved Mockups

| Screen | Mockup Path | Direction | Notes |
|--------|-------------|-----------|-------|
| Home page | `~/.gstack/projects/help-center/designs/home-shotgun-20260414-212126/variant-H.png` | Editorial-technical × dub-style vertical stack | Approved via `/design-shotgun` 2026-04-14. Fix text typos in category blurbs during implementation. Cards render 3-col on desktop, 4-col on xl+, 1-col on mobile. |
| Article page | `~/.gstack/projects/help-center/designs/home-shotgun-20260414-212126/article-page.png` | 3-col layout (sidebar + body + TOC) with editorial h1 | Generated via `/plan-design-review` 2026-04-14. Serif h1 only (Instrument Serif 48px). h2+ in Geist Sans 22/600. Inline links in terracotta. Sidebar and TOC sticky. On xl+ breakpoint. |
| Category page | `~/.gstack/projects/help-center/designs/home-shotgun-20260414-212126/category-page.png` | 2-col (sidebar + content), editorial article list | Generated via `/plan-design-review` 2026-04-14. Serif category title (44px) + serif article titles (22px) in list. No cards — hairline row dividers only. Relative timestamps on right edge. |
