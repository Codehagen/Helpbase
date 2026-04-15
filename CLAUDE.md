# CLAUDE.md — helpbase

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, aesthetic direction, and motion rules are defined there.
Do not deviate without explicit user approval.

Key rules at a glance:
- Display typography is **Instrument Serif**. Body is **Geist Sans**. Code is **Geist Mono**. Never Inter/Roboto/Arial.
- Sole accent color is **terracotta `#C2410C`** (dark mode: `#EA580C`). No blue as primary. No purple anywhere. No gradients.
- Background is warm off-white `#FAF9F6`, not pure white.
- Motion budget: 2-3 intentional motions per page. No springs. No decorative floaters. Reduced-motion respected.
- Article body max-width 680px (~65ch).
- See `DESIGN.md` "Anti-Slop Blacklist" section for banned patterns. Flag any PR that introduces one.

## Repo Structure

- `apps/web` is both the helpbase.dev marketing site AND the scaffold customers install via `npx create-helpbase` / `shadcn add`. Design changes here ship to every customer.
- `packages/helpbase` — CLI.
- `packages/create-helpbase` — scaffolder.
- `registry/` — shadcn registry definition.
