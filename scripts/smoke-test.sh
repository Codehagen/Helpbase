#!/usr/bin/env bash
#
# scripts/smoke-test.sh — Real-world smoke test for helpbase AI generation.
#
# Runs `helpbase generate` against a handful of real URLs with a real
# AI_GATEWAY_API_KEY, writes the output to a throwaway /tmp directory, and
# echoes where to find it.
#
# Usage:
#   pnpm smoke                  Run once using the working-tree prompt.
#   pnpm smoke --baseline       Run twice: first with the committed prompt
#                               (baseline/), then with the working-tree
#                               prompt (current/). Diff the two folders in
#                               your editor to see the effect of your change.
#
# Cost: ~$0.02-0.05 per run on Gemini Flash Lite.
#
# See SMOKE.md for the grading rubric, failure triage, and PR checklist.
#

set -euo pipefail

# ---- Configuration ----------------------------------------------------------

TARGETS=(
  "vercel|https://vercel.com"
  "resend|https://resend.com"
)

# ---- Preflight --------------------------------------------------------------

if [ -z "${AI_GATEWAY_API_KEY:-}" ]; then
  echo "✖ AI_GATEWAY_API_KEY is not set"
  echo ""
  echo "  Get a key at https://vercel.com/ai-gateway (free \$5 credit, no card needed)"
  echo "  Then:"
  echo "    export AI_GATEWAY_API_KEY=your_key_here"
  echo ""
  echo "  Each smoke run costs ~\$0.02-0.05. Your \$5 credit buys 100+ runs."
  exit 1
fi

# Parse --baseline flag
BASELINE_MODE="false"
for arg in "$@"; do
  if [ "$arg" = "--baseline" ]; then
    BASELINE_MODE="true"
  fi
done

# Repo root (script may be invoked from anywhere via pnpm smoke)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SMOKE_DIR="/tmp/helpbase-smoke-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SMOKE_DIR"

echo "→ Smoke test output: $SMOKE_DIR"
echo ""

# ---- Helper: build the CLI once --------------------------------------------

build_cli() {
  local label="$1"
  echo "→ Building CLI ($label)..."
  if ! pnpm --filter helpbase build >/dev/null 2>&1; then
    echo "✖ CLI build failed ($label)."
    echo "  Run 'pnpm --filter helpbase typecheck' to see the errors."
    exit 1
  fi
}

# ---- Helper: run one generate against one target ---------------------------

CLI="node $REPO_ROOT/packages/cli/dist/index.js"

run_target() {
  local subdir="$1"        # e.g. baseline/vercel or current/vercel
  local url="$2"
  local label="$3"         # e.g. "baseline → vercel.com"

  echo "→ Target: $label"

  mkdir -p "$SMOKE_DIR/$subdir"
  if ! $CLI generate --url "$url" -o "$SMOKE_DIR/$subdir" --test; then
    echo "✖ Target failed: $label"
    echo "  Output (partial, if any): $SMOKE_DIR/$subdir"
    exit 1
  fi

  local count
  count=$(find "$SMOKE_DIR/$subdir" -name "*.mdx" -type f | wc -l | tr -d ' ')
  echo "  ✓ $count articles generated"
  echo ""
}

# ---- Helper: run all targets under a given subdir --------------------------

run_all_targets() {
  local parent="$1"   # "" for simple mode, "baseline" or "current" for split mode
  for target in "${TARGETS[@]}"; do
    local name="${target%%|*}"
    local url="${target##*|}"
    local subdir
    if [ -z "$parent" ]; then
      subdir="$name"
    else
      subdir="$parent/$name"
    fi
    run_target "$subdir" "$url" "${parent:+$parent → }$url"
  done
}

# ---- Baseline mode (safety checks + stash + run twice) ---------------------

if [ "$BASELINE_MODE" = "true" ]; then
  echo "→ Baseline mode: comparing committed prompt vs working-tree prompt"
  echo ""

  # Safety: refuse if there are unstaged changes outside packages/shared or
  # packages/cli. We don't want to stash someone's unrelated work.
  DIRTY_FILES="$(git status --porcelain 2>/dev/null | awk '{print $2}' || true)"
  if [ -n "$DIRTY_FILES" ]; then
    UNSAFE="$(echo "$DIRTY_FILES" | grep -v -E '^(packages/shared/|packages/cli/)' || true)"
    if [ -n "$UNSAFE" ]; then
      echo "✖ Working tree has uncommitted changes outside packages/shared/ and packages/cli/:"
      echo "$UNSAFE" | sed 's/^/    /'
      echo ""
      echo "  Baseline mode stashes your changes to build the committed prompt."
      echo "  Commit or stash unrelated work first, then re-run."
      exit 1
    fi
  fi

  STASH_CREATED="false"
  if [ -n "$DIRTY_FILES" ]; then
    echo "→ Stashing working-tree changes in packages/shared/ and packages/cli/..."
    if git stash push -m "helpbase smoke baseline $(date +%Y%m%d-%H%M%S)" -- packages/shared/ packages/cli/ >/dev/null 2>&1; then
      STASH_CREATED="true"
    fi
  fi

  # Always try to restore the stash on exit, even if something below fails.
  restore_stash() {
    if [ "$STASH_CREATED" = "true" ]; then
      echo ""
      echo "→ Restoring your working-tree changes..."
      git stash pop >/dev/null 2>&1 || {
        echo "✖ git stash pop failed — your changes are still in the stash."
        echo "  Run 'git stash list' and 'git stash pop' manually."
      }
    fi
  }
  trap restore_stash EXIT

  build_cli "baseline, from committed source"
  run_all_targets "baseline"

  # Restore working tree and rebuild with the contributor's changes
  if [ "$STASH_CREATED" = "true" ]; then
    echo "→ Restoring working-tree changes..."
    git stash pop >/dev/null 2>&1
    STASH_CREATED="false"
    trap - EXIT
  fi

  build_cli "current, from working tree"
  run_all_targets "current"

  echo "────────────────────────────────────────────────────────────────"
  echo "✓ Baseline smoke test complete"
  echo ""
  echo "  baseline:  $SMOKE_DIR/baseline"
  echo "  current:   $SMOKE_DIR/current"
  echo ""
  echo "→ Diff them in your editor:"
  echo "    diff -r $SMOKE_DIR/baseline $SMOKE_DIR/current"
  echo "    # or open both folders side by side"
  echo ""
  echo "→ Check your spend: https://vercel.com/dashboard/ai-gateway"
  echo "  (expected: ~\$0.04-0.10 for a baseline run)"
  echo ""
  echo "→ Grade the diff against the rubric in SMOKE.md."
  echo "  Is the 'current' output sharper, more concrete, fewer hallucinations?"
  exit 0
fi

# ---- Single-run mode -------------------------------------------------------

build_cli "working tree"
run_all_targets ""

echo "────────────────────────────────────────────────────────────────"
echo "✓ Smoke test complete"
echo ""
echo "  Output: $SMOKE_DIR"
echo ""
echo "→ Check your spend: https://vercel.com/dashboard/ai-gateway"
echo "  (expected: ~\$0.02-0.05 for this run)"
echo ""
echo "→ Grade the output against the rubric in SMOKE.md."
echo "→ If you changed the prompt, run 'pnpm smoke --baseline' to compare"
echo "  against the committed version."
