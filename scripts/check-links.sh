#!/usr/bin/env bash
#
# scripts/check-links.sh — Verify every `helpbase.dev/<path>` URL in the
# repo actually resolves. Catches the bug class that shipped on
# 2026-04-17 (nine `helpbase.dev/docs/byok` references, all 404 because
# the real URL is `/guides/byok`).
#
# What this checks: any URL matching `helpbase.dev/<path>` in source
# files (md, mdx, ts, tsx, json, yml, yaml). Bare `helpbase.dev` without
# a path is skipped (brand mention, not a link).
#
# What this skips: CHANGELOG.md (historical), pnpm-lock.yaml (no
# helpbase.dev links should live there anyway), node_modules, dist, .next.
#
# Exit codes:
#   0 — every URL returned 2xx or 3xx
#   1 — at least one URL returned 4xx / 5xx
# Timeouts and DNS failures print a warning but do NOT fail — transient
# network blips shouldn't block a local run.
#
# Usage:
#   pnpm check:links                        # check against production
#   LINK_CHECK_BASE=https://staging.helpbase.dev pnpm check:links
#   LINK_CHECK_TIMEOUT=20 pnpm check:links  # override 10s default

set -uo pipefail

BASE="${LINK_CHECK_BASE:-https://helpbase.dev}"
TIMEOUT="${LINK_CHECK_TIMEOUT:-10}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Colors (respect NO_COLOR / non-TTY)
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; D=$'\033[2m'; B=$'\033[1m'; N=$'\033[0m'
else
  R=""; G=""; Y=""; D=""; B=""; N=""
fi

echo "${B}Checking helpbase.dev links${N} against ${D}${BASE}${N}"
echo

# Extract every `https://helpbase.dev/<path>` URL from source files.
# - Scheme-ful match only — bare `helpbase.dev` in comments + display text
#   isn't a clickable link, so skipping it cuts false positives cleanly.
# - Strip trailing punctuation (period, comma, paren, bracket, quote).
# - Dedupe + sort.
# - Exclude test files (negative-test fixtures point at fake URLs) and
#   planning docs (drafts at repo root that may reference TBD pages).
# (Using `while read` instead of `mapfile` so this works on macOS bash 3.2.)
URLS=()
while IFS= read -r line; do
  [ -n "$line" ] && URLS+=("$line")
done < <(
  grep -rohE 'https://helpbase\.dev/[A-Za-z0-9/_.?=&#%~-]+' \
    --include='*.md' --include='*.mdx' \
    --include='*.ts' --include='*.tsx' \
    --include='*.js' --include='*.mjs' --include='*.cjs' \
    --include='*.json' --include='*.yml' --include='*.yaml' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next \
    --exclude-dir=.turbo --exclude-dir=.vercel --exclude-dir=.git \
    --exclude-dir=test --exclude-dir=tests --exclude-dir=__tests__ \
    --exclude='*.test.*' --exclude='*.spec.*' \
    --exclude='CHANGELOG.md' --exclude='pnpm-lock.yaml' --exclude='package-lock.json' \
    --exclude='*_PLAN.md' --exclude='*_PROMPT.md' --exclude='NEXT_SESSION_*.md' \
    . 2>/dev/null \
  | sed -E 's|[\.\,\;\:\)\]\}\"]+$||' \
  | grep -vE '/$' \
  | sort -u
)

TOTAL=${#URLS[@]}
if [ "$TOTAL" -eq 0 ]; then
  echo "${Y}No helpbase.dev links found in source files.${N} Nothing to check."
  exit 0
fi

FAIL=0
WARN=0
PASS=0

for url in "${URLS[@]}"; do
  # Rewrite the host if LINK_CHECK_BASE overrides the default.
  probe="${url/https:\/\/helpbase.dev/$BASE}"

  # HEAD first. If the server doesn't allow HEAD (some static hosts), retry GET.
  status=$(curl -sIo /dev/null -w '%{http_code}' \
    --max-time "$TIMEOUT" -L \
    -A 'helpbase-link-check/1.0' \
    "$probe" 2>/dev/null || echo "000")

  if [ "$status" = "405" ] || [ "$status" = "000" ]; then
    # HEAD not allowed or network blip — try GET (discard body).
    status=$(curl -so /dev/null -w '%{http_code}' \
      --max-time "$TIMEOUT" -L \
      -A 'helpbase-link-check/1.0' \
      "$probe" 2>/dev/null || echo "000")
  fi

  case "$status" in
    2*|3*)
      printf '  %s✓%s %s %s(%s)%s\n' "$G" "$N" "$url" "$D" "$status" "$N"
      PASS=$((PASS + 1))
      ;;
    401|403|405)
      # URL exists but is auth-gated or rejects HEAD — not a broken link.
      printf '  %s✓%s %s %s(%s, exists)%s\n' "$G" "$N" "$url" "$D" "$status" "$N"
      PASS=$((PASS + 1))
      ;;
    000|5*)
      printf '  %s?%s %s %s(%s, transient?)%s\n' "$Y" "$N" "$url" "$D" "$status" "$N"
      WARN=$((WARN + 1))
      ;;
    *)
      printf '  %s✗%s %s %s(%s)%s\n' "$R" "$N" "$url" "$D" "$status" "$N"
      FAIL=$((FAIL + 1))
      ;;
  esac
done

echo
echo "${B}${TOTAL}${N} checked  ${G}${PASS} ok${N}  ${R}${FAIL} broken${N}  ${Y}${WARN} timeouts${N}"

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "${R}FAIL${N}: at least one helpbase.dev link returned 4xx/5xx."
  echo "  Fix the source files that reference these URLs, or update the target page."
  exit 1
fi

exit 0
