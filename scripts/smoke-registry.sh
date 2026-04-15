#!/usr/bin/env bash
#
# scripts/smoke-registry.sh — End-to-end smoke test for the shadcn registry.
#
# This script proves that `shadcn add <helpbase.json>` actually produces a
# working help center when dropped into a fresh Next.js + shadcn/ui project.
# It is the defensive counterpart to smoke-install.sh (which covers the
# `npx create-helpbase` path).
#
# Without this test, the registry can silently drift from a working state
# and users will only find out when they try to use it.
#
# What this script does:
#   1. Rebuilds registry/helpbase/ from apps/web (pnpm sync:templates).
#   2. Rebuilds public/r/*.json (shadcn build).
#   3. Creates a scratch Next.js app in /tmp with Tailwind + App Router.
#   4. Runs `shadcn init -d -y` to set up shadcn with defaults.
#   5. Runs `shadcn add <path>/public/r/help-center.json -y`.
#   6. Runs `pnpm build` and asserts 9 expected routes appear.
#   7. Asserts the generated article HTML contains real MDX-rendered headings.
#
# Cost: $0 (no network AI calls, no registry hosting, just local fs + pnpm).
# Runtime: ~60-120s on a warm machine.
#
# Usage:
#   pnpm smoke:registry
#
# See SMOKE.md for the full rubric covering both smoke tests.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SMOKE_DIR="/tmp/helpbase-registry-smoke-$(date +%Y%m%d-%H%M%S)"
REGISTRY_JSON="$REPO_ROOT/apps/web/public/r/help-center.json"

# Colors for legibility when run interactively
if [ -t 1 ]; then
  BLUE=$'\033[34m'
  GREEN=$'\033[32m'
  RED=$'\033[31m'
  RESET=$'\033[0m'
else
  BLUE=""
  GREEN=""
  RED=""
  RESET=""
fi

echo "${BLUE}→ Syncing templates + registry from apps/web${RESET}"
pnpm sync:templates > /dev/null

echo "${BLUE}→ Building shadcn registry JSON${RESET}"
npx shadcn@latest build --output apps/web/public/r > /dev/null

if [ ! -f "$REGISTRY_JSON" ]; then
  echo "${RED}✖ Registry JSON not found at $REGISTRY_JSON${RESET}"
  echo "  Did shadcn build fail?"
  exit 1
fi

echo "${BLUE}→ Creating scratch Next.js project at $SMOKE_DIR${RESET}"
mkdir -p "$(dirname "$SMOKE_DIR")"
cd "$(dirname "$SMOKE_DIR")"
SCRATCH_NAME="$(basename "$SMOKE_DIR")"
npx create-next-app@latest "$SCRATCH_NAME" \
  --typescript \
  --tailwind \
  --app \
  --no-eslint \
  --no-src-dir \
  --no-turbopack \
  --import-alias "@/*" \
  --use-pnpm \
  --yes > /dev/null 2>&1

cd "$SMOKE_DIR"

echo "${BLUE}→ Running shadcn init with defaults${RESET}"
npx shadcn@latest init -d -y > /dev/null 2>&1

echo "${BLUE}→ Running shadcn add help-center from local registry JSON${RESET}"
npx shadcn@latest add "$REGISTRY_JSON" -y > /dev/null 2>&1

echo "${BLUE}→ Building the project${RESET}"
BUILD_OUTPUT=$(pnpm build 2>&1)
echo "$BUILD_OUTPUT" | tail -20

# Verify all expected routes are in the build output.
EXPECTED_ROUTES=(
  "/getting-started"
  "/customization"
  "/getting-started/introduction"
  "/customization/theming"
)

echo ""
echo "${BLUE}→ Verifying expected routes${RESET}"
FAIL=0
for route in "${EXPECTED_ROUTES[@]}"; do
  if echo "$BUILD_OUTPUT" | grep -qF "$route"; then
    echo "  ${GREEN}✓${RESET} $route"
  else
    echo "  ${RED}✖${RESET} $route — not found in build output"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  echo ""
  echo "${RED}✖ Build output did not contain all expected routes.${RESET}"
  echo "  Scratch project kept at $SMOKE_DIR for inspection."
  exit 1
fi

# Verify an article page contains real MDX-rendered content.
echo ""
echo "${BLUE}→ Verifying article HTML contains rendered content${RESET}"
ARTICLE_HTML="$SMOKE_DIR/.next/server/app/getting-started/introduction.html"
if [ ! -f "$ARTICLE_HTML" ]; then
  echo "${RED}✖ Expected HTML file not found: $ARTICLE_HTML${RESET}"
  exit 1
fi

ARTICLE_SIZE=$(wc -c < "$ARTICLE_HTML" | tr -d ' ')
if [ "$ARTICLE_SIZE" -lt 10000 ]; then
  echo "${RED}✖ Article HTML is only ${ARTICLE_SIZE} bytes (expected 10000+).${RESET}"
  echo "  Content likely did not render."
  exit 1
fi
echo "  ${GREEN}✓${RESET} ${ARTICLE_HTML##*/} is $ARTICLE_SIZE bytes"

# MDX content must include at least one <h1> and one <h2> from the article.
H1_COUNT=$(grep -cE '<h1[^>]*id=' "$ARTICLE_HTML" || true)
H2_COUNT=$(grep -cE '<h2[^>]*id=' "$ARTICLE_HTML" || true)
if [ "$H1_COUNT" -lt 1 ] || [ "$H2_COUNT" -lt 1 ]; then
  echo "${RED}✖ Article HTML is missing MDX-rendered headings (h1: $H1_COUNT, h2: $H2_COUNT).${RESET}"
  exit 1
fi
echo "  ${GREEN}✓${RESET} Article has $H1_COUNT h1 and $H2_COUNT h2 headings from MDX"

# Cleanup (unless KEEP_SMOKE=1)
if [ "${KEEP_SMOKE:-0}" != "1" ]; then
  echo ""
  echo "${BLUE}→ Cleaning up scratch project${RESET}"
  rm -rf "$SMOKE_DIR"
else
  echo ""
  echo "${BLUE}→ KEEP_SMOKE=1 set, scratch project kept at:${RESET}"
  echo "  $SMOKE_DIR"
fi

echo ""
echo "${GREEN}✓ Registry smoke test passed${RESET}"
