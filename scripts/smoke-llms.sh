#!/usr/bin/env bash
#
# scripts/smoke-llms.sh — Smoke test for llms.txt build artifacts.
#
# After `apps/web` builds (or after `generate:llms` runs), both
# `apps/web/public/llms.txt` and `apps/web/public/llms-full.txt` must exist
# and contain the expected shape.
#
# This test regenerates them from scratch and asserts:
#   - both files exist
#   - llms.txt starts with the H1 project name + a blockquote summary
#   - llms.txt contains at least one H2 section
#   - llms-full.txt contains at least one H1 doc header
#   - neither file is suspiciously tiny (<100 bytes = probably broken)
#
# Usage:
#   pnpm smoke:llms
#
# Cost: $0. Runtime: <5s.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
PUBLIC_DIR="$WEB_DIR/public"

echo "→ Regenerating llms artifacts..."
(cd "$WEB_DIR" && node scripts/generate-llms.mjs)

LLMS="$PUBLIC_DIR/llms.txt"
LLMS_FULL="$PUBLIC_DIR/llms-full.txt"

if [ ! -f "$LLMS" ]; then
  echo "✗ Missing: $LLMS"
  exit 1
fi
if [ ! -f "$LLMS_FULL" ]; then
  echo "✗ Missing: $LLMS_FULL"
  exit 1
fi

LLMS_BYTES=$(wc -c < "$LLMS")
LLMS_FULL_BYTES=$(wc -c < "$LLMS_FULL")

if [ "$LLMS_BYTES" -lt 100 ]; then
  echo "✗ llms.txt is suspiciously small ($LLMS_BYTES bytes)."
  exit 1
fi
if [ "$LLMS_FULL_BYTES" -lt 100 ]; then
  echo "✗ llms-full.txt is suspiciously small ($LLMS_FULL_BYTES bytes)."
  exit 1
fi

if ! head -1 "$LLMS" | grep -q "^# "; then
  echo "✗ llms.txt missing H1 on first line."
  exit 1
fi
if ! head -5 "$LLMS" | grep -q "^> "; then
  echo "✗ llms.txt missing blockquote summary in first 5 lines."
  exit 1
fi
if ! grep -q "^## " "$LLMS"; then
  echo "✗ llms.txt missing any H2 section (no categories found)."
  exit 1
fi
if ! grep -q "^# " "$LLMS_FULL"; then
  echo "✗ llms-full.txt missing any H1 doc header."
  exit 1
fi

echo "✓ llms.txt ($LLMS_BYTES bytes) + llms-full.txt ($LLMS_FULL_BYTES bytes) look good."
