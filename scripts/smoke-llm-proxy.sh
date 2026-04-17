#!/usr/bin/env bash
#
# scripts/smoke-llm-proxy.sh — End-to-end smoke for /api/v1/llm/*.
#
# Exercises the hosted LLM proxy on a deployed URL with a real HELPBASE_TOKEN.
# Asserts: the auth gate 401s on missing header, the happy path returns 200
# with {object, usage, quota}, and the usage endpoint round-trips.
#
# Does NOT exercise the 429 quota path (that would require pre-seeding the
# test user near cap) or the 503 global cap (same). Those are covered by
# unit tests in apps/web/test/api-llm.test.ts.
#
# Usage:
#   scripts/smoke-llm-proxy.sh <base-url> <helpbase-token>
#
# Example:
#   scripts/smoke-llm-proxy.sh https://helpbase.dev "$HELPBASE_TOKEN"
#   scripts/smoke-llm-proxy.sh https://my-preview.vercel.app "$HELPBASE_TOKEN"
#
# Exits 0 on success, non-zero on any assertion failure.
#

set -euo pipefail

BASE="${1:-}"
TOKEN="${2:-${HELPBASE_TOKEN:-}}"

if [ -z "$BASE" ] || [ -z "$TOKEN" ]; then
  echo "usage: $0 <base-url> <helpbase-token>" >&2
  echo "  BASE can also be passed as the first arg (e.g. https://helpbase.dev)" >&2
  echo "  TOKEN defaults to \$HELPBASE_TOKEN if the second arg is omitted" >&2
  exit 2
fi

BASE="${BASE%/}"  # strip trailing slash

say() { printf "\n→ %s\n" "$*"; }
pass() { printf "  ✓ %s\n" "$*"; }
fail() { printf "  ✖ %s\n" "$*" >&2; exit 1; }

# ─── 1. Auth gate: missing Authorization → 401 ─────────────────────
say "auth gate: POST /api/v1/llm/generate-text WITHOUT Authorization header"
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/v1/llm/generate-text" \
  -H "Content-Type: application/json" \
  -d '{"model":"google/gemini-3.1-flash-lite-preview","prompt":"hi"}')
if [ "$STATUS" != "401" ]; then
  fail "expected 401, got $STATUS (base=$BASE)"
fi
pass "401 as expected"

# ─── 2. Auth gate: bad token → 401 ─────────────────────────────────
say "auth gate: POST with an obviously-bogus token"
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/v1/llm/generate-text" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer not-a-real-token-abc123" \
  -d '{"model":"google/gemini-3.1-flash-lite-preview","prompt":"hi"}')
if [ "$STATUS" != "401" ]; then
  fail "expected 401 for bogus token, got $STATUS"
fi
pass "401 as expected"

# ─── 3. Usage endpoint round-trips ─────────────────────────────────
say "usage: GET /api/v1/usage/today with valid token"
USAGE_JSON=$(curl -sS -f "$BASE/api/v1/usage/today" \
  -H "Authorization: Bearer $TOKEN" 2>&1) || fail "usage endpoint error: $USAGE_JSON"
echo "    $USAGE_JSON"
echo "$USAGE_JSON" | grep -q '"usedToday"' || fail "response missing usedToday field"
echo "$USAGE_JSON" | grep -q '"dailyLimit"' || fail "response missing dailyLimit field"
echo "$USAGE_JSON" | grep -q '"resetAt"' || fail "response missing resetAt field"
pass "usage endpoint returns a valid WireQuotaStatus"

# ─── 4. Happy path: generate-text → 200 with usage ─────────────────
say "happy path: POST /api/v1/llm/generate-text with valid token (small request)"
RESP=$(curl -sS -f -X POST "$BASE/api/v1/llm/generate-text" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"model":"google/gemini-3.1-flash-lite-preview","prompt":"Reply with the word OK and nothing else.","maxOutputTokens":16}' \
  2>&1) || fail "generate-text error: $RESP"

echo "    response preview: $(echo "$RESP" | head -c 200)..."
echo "$RESP" | grep -q '"text"' || fail "response missing text field"
echo "$RESP" | grep -q '"usage"' || fail "response missing usage field"
echo "$RESP" | grep -q '"quota"' || fail "response missing quota field"
pass "200 with {text, usage, quota}"

# ─── 5. Bad request: missing model → 400 ───────────────────────────
say "bad request: POST with no model field → 400"
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/v1/llm/generate-text" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt":"hi"}')
if [ "$STATUS" != "400" ]; then
  fail "expected 400, got $STATUS"
fi
pass "400 as expected"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✓ smoke-llm-proxy: all assertions passed against $BASE"
echo ""
echo "  To test the 429 quota path, pre-seed a test user near the cap and"
echo "  run this script with that user's token. Not automated because the"
echo "  overrun pattern (read before write) means 429 is inherently racy."
