#!/usr/bin/env bash
#
# scripts/smoke-deploy.sh — End-to-end hosted-tier deploy smoke test.
#
# Why this exists:
# - The CLI + RPC + MCP route have unit tests, but none of them exercise
#   the full loop: auth → CLI deploy → atomic RPC → hosted URL → MCP
#   handshake → tool call → result. That loop is what a real user runs.
# - If this script passes against staging, the hosted-tier-v1 install
#   path is real end-to-end.
#
# Usage:
#   pnpm smoke:deploy                 Run against the Supabase project that
#                                     NEXT_PUBLIC_SUPABASE_URL points at
#                                     (+ HELPBASE_TOKEN for CI / non-
#                                     interactive auth).
#
# Required env vars:
#   HELPBASE_TOKEN                    Supabase access token for the test user
#   NEXT_PUBLIC_SUPABASE_URL          Target Supabase project URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY     Anon key for the project
#
# Optional env vars:
#   SMOKE_DEPLOY_BASE                 Override the hosted URL base for a
#                                     preview deployment, e.g.
#                                     https://helpbase-preview.vercel.app
#                                     (default: https://helpbase.dev)
#   SMOKE_DEPLOY_SKIP_HTTP_CHECKS     Set to 1 to skip the live-URL/MCP
#                                     asserts (useful before the hosted
#                                     app is deployed to Vercel).
#
# Behavior when required env vars are absent:
#   - Prints a skip message and exits 0 (to keep CI green on PRs that
#     don't touch hosted-tier code, and to let local devs run the rest
#     of the `pnpm smoke` suite without Supabase creds).
#
# Cleanup:
#   - Tenant is deleted at the end of the run regardless of pass/fail,
#     so rerunning is idempotent.
#
# Cost: $0 (no AI calls, one Supabase project, one short HTTP roundtrip).
# Runtime: ~15-30 seconds.
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BASE_URL="${SMOKE_DEPLOY_BASE:-https://helpbase.dev}"

# ─── env gate ───────────────────────────────────────────────────────
if [[ -z "${HELPBASE_TOKEN:-}" ]]; then
  echo "⊘ HELPBASE_TOKEN not set — skipping smoke:deploy"
  echo "  (set it to a valid Supabase access token to enable the smoke test)"
  exit 0
fi
if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "⊘ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipping smoke:deploy"
  exit 0
fi

# ─── slug + tmpdir ───────────────────────────────────────────────────
# Short + deterministic so we can reliably clean up the prior run.
SHA_SHORT="$(git rev-parse --short HEAD 2>/dev/null || echo ci0000)"
SMOKE_SLUG="${SMOKE_DEPLOY_SLUG:-smoke-${SHA_SHORT}}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "→ smoke:deploy on slug=${SMOKE_SLUG}"
echo "  tmpdir=${TMP_DIR}"

# ─── fixture content ─────────────────────────────────────────────────
mkdir -p "${TMP_DIR}/content/getting-started"
cat > "${TMP_DIR}/content/getting-started/_category.json" <<'EOF'
{"title": "Getting Started", "description": "Basic setup", "icon": "book", "order": 1}
EOF
cat > "${TMP_DIR}/content/getting-started/hello.mdx" <<'EOF'
---
schemaVersion: 1
title: Hello Smoke
description: A smoke-test article used by scripts/smoke-deploy.sh.
order: 1
tags: ["smoke"]
featured: false
---

# Hello smoke

This article exists so the smoke test has something to query.

To log in, run `helpbase login` from your project root.

After login, `helpbase deploy` uploads your content and mints an MCP token.
EOF

# ─── build the CLI ──────────────────────────────────────────────────
echo "→ building CLI from source..."
pnpm --filter @workspace/cli... build 2>&1 | tail -3 || pnpm --filter helpbase... build 2>&1 | tail -3 || true
# The bin that matters:
CLI_BIN="${REPO_ROOT}/packages/cli/dist/index.js"
if [[ ! -f "${CLI_BIN}" ]]; then
  echo "✖ CLI not built at ${CLI_BIN}"
  exit 1
fi

# ─── run deploy end-to-end ──────────────────────────────────────────
echo "→ running helpbase deploy --slug ${SMOKE_SLUG}..."
cd "${TMP_DIR}"
node "${CLI_BIN}" deploy --slug "${SMOKE_SLUG}" 2>&1 | tee "${TMP_DIR}/deploy.log"
DEPLOY_EXIT=${PIPESTATUS[0]}
cd "${REPO_ROOT}"

if [[ "${DEPLOY_EXIT}" -ne 0 ]]; then
  echo "✖ helpbase deploy failed (exit ${DEPLOY_EXIT})"
  exit 1
fi
echo "✓ deploy RPC succeeded"

# Extract the bearer token from the deploy output's printed MCP config.
# The note block includes `"Authorization": "Bearer <token>"`.
MCP_TOKEN="$(grep -oE 'Bearer [a-f0-9]{64}' "${TMP_DIR}/deploy.log" | head -1 | awk '{print $2}' || true)"
if [[ -z "${MCP_TOKEN}" ]]; then
  echo "✖ deploy output did not include an MCP bearer token"
  exit 1
fi
echo "✓ MCP token printed in deploy output (${MCP_TOKEN:0:8}...)"

# ─── optional: live HTTP asserts ───────────────────────────────────
if [[ "${SMOKE_DEPLOY_SKIP_HTTP_CHECKS:-}" == "1" ]]; then
  echo "⊘ SMOKE_DEPLOY_SKIP_HTTP_CHECKS=1 — skipping live-URL + MCP asserts"
else
  # Splice the tenant slug into the base URL's hostname. Bash parameter
  # substitution with escaped slashes in the REPLACEMENT half leaks the
  # backslashes into the output on some bash versions — producing URLs
  # like "https:\/\/smoke-abc.helpbase.dev/mcp". Do the splice with a
  # plain scheme-prefix match instead; no escaping drama.
  if [[ "${BASE_URL}" == *"${SMOKE_SLUG}"* ]]; then
    # Preview deployment where BASE_URL already includes {slug}.
    MCP_URL="${BASE_URL}/mcp"
  elif [[ "${BASE_URL}" == https://* ]]; then
    MCP_URL="https://${SMOKE_SLUG}.${BASE_URL#https://}/mcp"
  elif [[ "${BASE_URL}" == http://* ]]; then
    MCP_URL="http://${SMOKE_SLUG}.${BASE_URL#http://}/mcp"
  else
    MCP_URL="${SMOKE_SLUG}.${BASE_URL}/mcp"
  fi
  echo "→ hitting MCP endpoint at ${MCP_URL}"

  INIT_RESPONSE="$(curl -sf -X POST "${MCP_URL}" \
    -H "Authorization: Bearer ${MCP_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}' \
    || echo "CURL_FAILED")"

  if [[ "${INIT_RESPONSE}" == "CURL_FAILED" ]]; then
    echo "✖ MCP initialize request failed (endpoint not reachable at ${MCP_URL})"
    echo "  hint: set SMOKE_DEPLOY_SKIP_HTTP_CHECKS=1 before the hosted app is deployed,"
    echo "        or ensure *.helpbase.dev DNS + Vercel wildcard are live."
    CLEANUP_AND_FAIL=1
  elif [[ "${INIT_RESPONSE}" != *"protocolVersion"* ]]; then
    echo "✖ MCP initialize returned an unexpected payload:"
    echo "  ${INIT_RESPONSE}"
    CLEANUP_AND_FAIL=1
  else
    echo "✓ MCP initialize succeeded"
  fi
fi

# ─── cleanup: delete the test tenant ───────────────────────────────
echo "→ cleaning up tenant ${SMOKE_SLUG}..."
node "${CLI_BIN}" deploy --delete "${SMOKE_SLUG}" --yes 2>&1 | tail -3 || {
  echo "  ⚠ cleanup failed — tenant ${SMOKE_SLUG} may need manual deletion"
  echo "    run: helpbase deploy --delete ${SMOKE_SLUG} --yes"
}

if [[ "${CLEANUP_AND_FAIL:-0}" -eq 1 ]]; then
  exit 1
fi

echo ""
echo "✓ smoke:deploy passed — hosted-tier v1 install path works end-to-end"
