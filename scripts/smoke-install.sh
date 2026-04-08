#!/usr/bin/env bash
#
# scripts/smoke-install.sh — End-to-end install path smoke test.
#
# Why this exists:
# - The unit tests for create-helpbase verify the scaffolder writes the
#   files it claims to write. They do NOT verify those files constitute a
#   buildable Next.js project.
# - On 2026-04-09, a real `npx create-helpbase` produced a 2-file Next.js
#   stub instead of the polished help center the README promised. 12 prior
#   review entries (CEO, eng, design, devex) missed it because none of
#   them ran the user's actual install path.
# - This script IS the regression test. It scaffolds a fresh project,
#   installs deps, runs `pnpm build`, and asserts the build succeeds AND
#   produces the expected routes. If this script passes, the install path
#   is real. If it fails, ship is blocked.
#
# Usage:
#   pnpm smoke:install              Standard run against the source dist/.
#   pnpm smoke:install --pack       Test against an `npm pack` tarball
#                                   (catches the package.json `files`
#                                   array foot-gun where templates/ is
#                                   missing from the published artifact).
#
# Cost: $0 (no AI calls, no network beyond npm install).
# Runtime: ~30-60 seconds depending on npm install cache state.
#

set -euo pipefail

# ---- Parse flags ------------------------------------------------------------

PACK_MODE="false"
for arg in "$@"; do
  if [ "$arg" = "--pack" ]; then
    PACK_MODE="true"
  fi
done

# ---- Setup ------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SMOKE_DIR="/tmp/helpbase-install-smoke-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SMOKE_DIR"

echo "→ Install smoke test output: $SMOKE_DIR"
echo ""

# Make sure dist/ is fresh.
echo "→ Building create-helpbase..."
pnpm --filter create-helpbase build > "$SMOKE_DIR/build.log" 2>&1
echo "  ✓ Build complete"
echo ""

# ---- Resolve the CLI path (source dist/ vs packed tarball) ------------------

if [ "$PACK_MODE" = "true" ]; then
  echo "→ Pack mode: building tarball via npm pack..."
  PACK_DIR="$SMOKE_DIR/pack"
  mkdir -p "$PACK_DIR"
  cd packages/create-helpbase
  TARBALL=$(npm pack --pack-destination "$PACK_DIR" 2>&1 | tail -1)
  cd "$REPO_ROOT"
  echo "  ✓ Tarball: $PACK_DIR/$TARBALL"

  echo "→ Installing tarball into a fresh project..."
  INSTALL_DIR="$SMOKE_DIR/install"
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  npm init -y > /dev/null
  npm install "$PACK_DIR/$TARBALL" > "$SMOKE_DIR/tarball-install.log" 2>&1
  CLI_PATH="$INSTALL_DIR/node_modules/.bin/create-helpbase"
  echo "  ✓ Tarball installed at $CLI_PATH"
  echo ""
else
  CLI_PATH="$REPO_ROOT/packages/create-helpbase/dist/index.js"
  if [ ! -f "$CLI_PATH" ]; then
    echo "✖ CLI not found at $CLI_PATH"
    echo "  Run 'pnpm --filter create-helpbase build' first."
    exit 1
  fi
fi

# ---- Scaffold a fresh project -----------------------------------------------

PROJECT_NAME="smoke-test-app"
PROJECT_PARENT="$SMOKE_DIR/scaffold"
mkdir -p "$PROJECT_PARENT"
cd "$PROJECT_PARENT"

echo "→ Scaffolding $PROJECT_NAME..."
if [ "$PACK_MODE" = "true" ]; then
  "$CLI_PATH" "$PROJECT_NAME" --no-install --no-open </dev/null > "$SMOKE_DIR/scaffold.log" 2>&1
else
  node "$CLI_PATH" "$PROJECT_NAME" --no-install --no-open </dev/null > "$SMOKE_DIR/scaffold.log" 2>&1
fi
PROJECT_DIR="$PROJECT_PARENT/$PROJECT_NAME"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "✖ Scaffold failed — project dir not created"
  cat "$SMOKE_DIR/scaffold.log"
  exit 1
fi
SCAFFOLD_FILE_COUNT=$(find "$PROJECT_DIR" -type f -not -path '*/node_modules/*' | wc -l | tr -d ' ')
echo "  ✓ Scaffolded $SCAFFOLD_FILE_COUNT files"
echo ""

# ---- Sanity-check critical files exist --------------------------------------

REQUIRED_FILES=(
  "package.json"
  "tsconfig.json"
  "next.config.mjs"
  "postcss.config.mjs"
  "components.json"
  "eslint.config.mjs"
  "app/layout.tsx"
  "app/page.tsx"
  "app/globals.css"
  "app/(docs)/layout.tsx"
  "app/(docs)/[category]/page.tsx"
  "app/(docs)/[category]/[slug]/page.tsx"
  "components/header.tsx"
  "components/docs-sidebar.tsx"
  "components/search-dialog.tsx"
  "components/toc.tsx"
  "components/ui/badge.tsx"
  "lib/content.ts"
  "lib/search.ts"
  "lib/utils.ts"
  "lib/schemas.ts"
  "content/getting-started/introduction.mdx"
)

echo "→ Verifying required files..."
MISSING=()
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$PROJECT_DIR/$file" ]; then
    MISSING+=("$file")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "✖ Missing required files:"
  for file in "${MISSING[@]}"; do
    echo "    $file"
  done
  echo ""
  echo "  Cause: most likely the templates dir was not included in the published artifact."
  echo "  Fix:   verify packages/create-helpbase/package.json has \"files\": [\"dist\", \"templates\"]"
  exit 1
fi
echo "  ✓ All ${#REQUIRED_FILES[@]} required files present"
echo ""

# ---- Sanity-check no @workspace/* leftovers ---------------------------------

echo "→ Checking for @workspace/* leftovers..."
LEFTOVER_FILES=$(grep -rl "@workspace/" "$PROJECT_DIR" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.css" --include="*.mjs" 2>/dev/null || true)
if [ -n "$LEFTOVER_FILES" ]; then
  echo "✖ @workspace/* references found in scaffolded project:"
  echo "$LEFTOVER_FILES"
  echo ""
  echo "  Cause: sync-templates.mjs IMPORT_TRANSFORMS map is missing an entry."
  exit 1
fi
echo "  ✓ No @workspace/* references"
echo ""

# ---- Install + build --------------------------------------------------------

cd "$PROJECT_DIR"

echo "→ Installing dependencies (pnpm install)..."
pnpm install > "$SMOKE_DIR/install.log" 2>&1
echo "  ✓ Installed"
echo ""

echo "→ Running production build (pnpm build)..."
if pnpm build > "$SMOKE_DIR/build-out.log" 2>&1; then
  echo "  ✓ Build succeeded"
else
  echo "✖ Build failed"
  echo ""
  tail -40 "$SMOKE_DIR/build-out.log"
  exit 1
fi
echo ""

# ---- Verify expected routes were generated ----------------------------------

EXPECTED_ROUTES=(
  "/_not-found"
  "/getting-started"
  "/customization"
  "/getting-started/introduction"
  "/customization/theming"
)

echo "→ Verifying expected routes were generated..."
for route in "${EXPECTED_ROUTES[@]}"; do
  if ! grep -q "$route" "$SMOKE_DIR/build-out.log"; then
    echo "✖ Expected route not found in build output: $route"
    echo "  See $SMOKE_DIR/build-out.log"
    exit 1
  fi
done
echo "  ✓ All ${#EXPECTED_ROUTES[@]} expected routes generated"
echo ""

# ---- All clear --------------------------------------------------------------

echo "════════════════════════════════════════════════════════════════════════"
echo "✓ Install smoke test passed"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "  Mode:           $([ "$PACK_MODE" = "true" ] && echo "tarball (npm pack)" || echo "source dist/")"
echo "  Files:          $SCAFFOLD_FILE_COUNT scaffolded"
echo "  Routes:         ${#EXPECTED_ROUTES[@]} verified"
echo "  Output dir:     $SMOKE_DIR"
echo ""
echo "  The install path is real. Users running 'npx create-helpbase' will"
echo "  land on a polished help center, not a Next.js stub."
echo ""
