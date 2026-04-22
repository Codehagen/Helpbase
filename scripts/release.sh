#!/usr/bin/env bash
#
# scripts/release.sh — publish helpbase + create-helpbase from main.
#
# Reads the local version from each package.json, compares against the
# version currently on npm, and publishes only the ones that have been
# bumped. Idempotent — re-running after a partial success (e.g. 2FA
# failed on the second publish) does the right thing.
#
# Usage:
#   pnpm release                    # publish helpbase + create-helpbase (if bumped)
#   pnpm release helpbase           # publish only the CLI
#   pnpm release create-helpbase    # publish only the scaffolder
#   pnpm release mcp                # publish only @helpbase/mcp
#   pnpm release --dry-run          # show what would publish, don't call npm
#   pnpm release --skip-build       # trust existing dist/ (faster reruns)
#
# `mcp` is opt-in: it is NOT part of the default set because its release
# cadence is independent from helpbase + create-helpbase.
#
# Auth: run `npm login` once first. Each publish prompts for 2FA in
# your browser if you have it enabled.
#
# What this does NOT do (intentionally):
#   - Bump versions. Edit package.json by hand, commit it.
#   - Write CHANGELOG. Write it by hand next to the version bump.
#   - git commit / tag / push. Run those yourself after publish succeeds.
#
# What it checks:
#   - You're on main (warn if not)
#   - Git working tree is clean-enough (warn if not)
#   - Local version > latest on npm (skip otherwise)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN="false"
SKIP_BUILD="false"
PACKAGES=()

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="true" ;;
    --skip-build) SKIP_BUILD="true" ;;
    -h|--help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    helpbase|create-helpbase|mcp) PACKAGES+=("$arg") ;;
    -*) echo "Unknown flag: $arg" >&2; exit 2 ;;
    *) echo "Unknown package: $arg (expected helpbase, create-helpbase, or mcp)" >&2; exit 2 ;;
  esac
done

if [ ${#PACKAGES[@]} -eq 0 ]; then
  PACKAGES=("helpbase" "create-helpbase")
fi

# ---- Soft safety checks -----------------------------------------------------

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [ "$BRANCH" != "main" ]; then
  echo "! You're on '$BRANCH', not main. Proceed with care." >&2
fi

if ! git diff --quiet --ignore-submodules HEAD 2>/dev/null; then
  echo "! Working tree has uncommitted changes. pnpm publish will still run," >&2
  echo "  but nothing here commits / tags / pushes for you." >&2
fi

# ---- Helpers ----------------------------------------------------------------

pkg_dir_for() {
  case "$1" in
    helpbase) echo "packages/cli" ;;
    create-helpbase) echo "packages/create-helpbase" ;;
    mcp) echo "packages/mcp" ;;
  esac
}

# Map our CLI alias to the npm registry name (for `npm view`).
npm_name_for() {
  case "$1" in
    mcp) echo "@helpbase/mcp" ;;
    *) echo "$1" ;;
  esac
}

# Parse package.json .version without needing jq — pnpm monorepos have
# node available but not always jq.
read_local_version() {
  node -e "const p=require('./$1/package.json');process.stdout.write(p.version)"
}

# Query npm for the latest published version. Fails open with empty
# string so the first release of a package doesn't block the script.
read_published_version() {
  npm view "$1" version 2>/dev/null || echo ""
}

version_is_newer() {
  # $1 = local, $2 = published. Returns 0 if local > published (strictly
  # newer). semver-aware via node.
  local local_v="$1"
  local pub_v="$2"
  if [ -z "$pub_v" ]; then
    # First publish — anything local is newer than "nothing".
    return 0
  fi
  node -e "
    const [a,b] = [process.argv[1], process.argv[2]].map(v => v.split('.').map(Number));
    for (let i = 0; i < 3; i++) {
      const ai = a[i] ?? 0, bi = b[i] ?? 0;
      if (ai > bi) process.exit(0);
      if (ai < bi) process.exit(1);
    }
    process.exit(1);
  " "$local_v" "$pub_v"
}

# ---- Build once (all packages share a build) --------------------------------

if [ "$SKIP_BUILD" = "false" ]; then
  echo "→ Building..."
  # Build every selected package plus its workspace deps. Shared is always
  # built because helpbase + create-helpbase consume it; mcp is standalone.
  BUILD_FILTERS=(--filter "@workspace/shared")
  for pkg in "${PACKAGES[@]}"; do
    case "$pkg" in
      mcp) BUILD_FILTERS+=(--filter "@helpbase/mcp") ;;
      *)   BUILD_FILTERS+=(--filter "$pkg") ;;
    esac
  done
  pnpm -w -r "${BUILD_FILTERS[@]}" build >/tmp/helpbase-release-build.log 2>&1 || {
    echo "✖ Build failed — see /tmp/helpbase-release-build.log" >&2
    tail -20 /tmp/helpbase-release-build.log >&2
    exit 1
  }
  echo "  ✓ Build complete"
fi

# ---- Publish each package if bumped -----------------------------------------

PUBLISHED=()
SKIPPED=()

for pkg in "${PACKAGES[@]}"; do
  dir=$(pkg_dir_for "$pkg")
  npm_name=$(npm_name_for "$pkg")
  local_v=$(read_local_version "$dir")
  pub_v=$(read_published_version "$npm_name")

  if version_is_newer "$local_v" "$pub_v"; then
    echo ""
    echo "→ $npm_name: local $local_v > npm $pub_v — publishing..."
    if [ "$DRY_RUN" = "true" ]; then
      ( cd "$dir" && pnpm publish --dry-run --no-git-checks 2>&1 | tail -5 )
      PUBLISHED+=("$npm_name@$local_v (dry-run)")
    else
      ( cd "$dir" && pnpm publish --no-git-checks )
      PUBLISHED+=("$npm_name@$local_v")
    fi
  else
    echo ""
    echo "→ $npm_name: local $local_v == npm $pub_v (or older) — skipping."
    SKIPPED+=("$npm_name@$local_v")
  fi
done

# ---- Summary ----------------------------------------------------------------

echo ""
echo "════════════════════════════════════════════════════════════════"
if [ ${#PUBLISHED[@]} -gt 0 ]; then
  echo "✓ Published:"
  for p in "${PUBLISHED[@]}"; do echo "  • $p"; done
fi
if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "○ Skipped (already on npm):"
  for p in "${SKIPPED[@]}"; do echo "  • $p"; done
fi
echo ""
if [ "$DRY_RUN" = "false" ] && [ ${#PUBLISHED[@]} -gt 0 ]; then
  echo "Next: commit + tag + push the versions you just published."
  for p in "${PUBLISHED[@]}"; do
    # p is like "helpbase@0.4.0"
    echo "  git tag $p"
  done
  echo "  git push origin main --tags"
fi
