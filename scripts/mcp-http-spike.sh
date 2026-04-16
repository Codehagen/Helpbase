#!/usr/bin/env bash
#
# scripts/mcp-http-spike.sh — Boot the MCP HTTP server behind ngrok
# so you can test Streamable HTTP + bearer-token auth against real
# MCP clients (Claude Desktop, Claude Code, Cursor) outside of Vercel.
#
# Why this exists:
# - The Vercel-hosted MCP route at apps/web/app/(tenant)/t/[tenant]/mcp
#   returned HTTP 406 in the first end-to-end run on 2026-04-16. The
#   SDK's StreamableHTTPServerTransport rejected the Accept header
#   that passed through the Next.js → Node bridge, even though the
#   client sent the right value.
# - packages/mcp/src/http.ts (the SAME SDK, same transport) works
#   correctly when exposed directly via Node + ngrok. That's the
#   known-good baseline to diff against when debugging any future
#   hosted-route regression.
# - This script reproduces that baseline in ~10 seconds.
#
# Prereqs (one-time):
#   - ngrok installed + authenticated: brew install ngrok && ngrok config add-authtoken ...
#   - packages/mcp built: pnpm --filter @helpbase/mcp build
#   - A content directory. Default: apps/web/content (17 docs).
#
# Usage:
#   bash scripts/mcp-http-spike.sh                                  # use apps/web/content
#   HELPBASE_CONTENT_DIR=/path/to/content bash scripts/mcp-http-spike.sh
#   PORT=4000 bash scripts/mcp-http-spike.sh                        # override port
#
# Clean up:
#   bash scripts/mcp-http-spike.sh --kill
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PORT="${PORT:-3939}"
CLI_BIN="${REPO_ROOT}/packages/mcp/dist/http-cli.js"
CONTENT_DIR="${HELPBASE_CONTENT_DIR:-${REPO_ROOT}/apps/web/content}"
TOKEN_FILE="/tmp/helpbase-mcp-spike-token"
PID_FILE_MCP="/tmp/helpbase-mcp-spike-mcp.pid"
PID_FILE_NGROK="/tmp/helpbase-mcp-spike-ngrok.pid"
LOG_MCP="/tmp/helpbase-mcp-spike-mcp.log"
LOG_NGROK="/tmp/helpbase-mcp-spike-ngrok.log"

if [[ "${1:-}" == "--kill" ]]; then
  [[ -f "$PID_FILE_MCP" ]]   && kill -9 "$(cat "$PID_FILE_MCP")"   2>/dev/null || true
  [[ -f "$PID_FILE_NGROK" ]] && kill -9 "$(cat "$PID_FILE_NGROK")" 2>/dev/null || true
  lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  pkill -f "ngrok http ${PORT}"  2>/dev/null || true
  rm -f "$TOKEN_FILE" "$PID_FILE_MCP" "$PID_FILE_NGROK" "$LOG_MCP" "$LOG_NGROK"
  echo "✓ Spike torn down."
  exit 0
fi

if [[ ! -x "$(command -v ngrok)" ]]; then
  echo "✖ ngrok not found. Install: brew install ngrok && ngrok config add-authtoken <token>"
  exit 1
fi
if [[ ! -f "$CLI_BIN" ]]; then
  echo "→ Building @helpbase/mcp first..."
  pnpm --filter @helpbase/mcp build > /dev/null
fi
if [[ ! -d "$CONTENT_DIR" ]]; then
  echo "✖ Content directory not found: $CONTENT_DIR"
  echo "  Set HELPBASE_CONTENT_DIR or run from a project root with content/."
  exit 1
fi

# Pre-clean anything bound to the target port.
lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
pkill -f "ngrok http ${PORT}" 2>/dev/null || true
sleep 1

SPIKE_TOKEN="$(openssl rand -hex 32)"
echo "$SPIKE_TOKEN" > "$TOKEN_FILE"

# Start MCP HTTP server.
HELPBASE_MCP_TOKEN="$SPIKE_TOKEN" \
HELPBASE_MCP_ALLOWED_ORIGINS="*" \
HELPBASE_CONTENT_DIR="$CONTENT_DIR" \
PORT="$PORT" \
  nohup node "$CLI_BIN" > "$LOG_MCP" 2>&1 &
MCP_PID=$!
echo "$MCP_PID" > "$PID_FILE_MCP"
disown $MCP_PID 2>/dev/null || true

# Start ngrok tunnel.
nohup ngrok http "$PORT" --log=stdout > "$LOG_NGROK" 2>&1 &
NGROK_PID=$!
echo "$NGROK_PID" > "$PID_FILE_NGROK"
disown $NGROK_PID 2>/dev/null || true

# Wait for ngrok to register a public URL via its local API.
NGROK_URL=""
for _ in $(seq 1 15); do
  NGROK_URL="$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['tunnels'][0]['public_url'])" 2>/dev/null || true)"
  [[ -n "$NGROK_URL" ]] && break
  sleep 1
done
if [[ -z "$NGROK_URL" ]]; then
  echo "✖ ngrok did not start. Logs at $LOG_NGROK"
  tail -20 "$LOG_NGROK"
  bash "$0" --kill
  exit 1
fi

# Wait for MCP server to bind.
for _ in $(seq 1 10); do
  if grep -q "HTTP transport listening" "$LOG_MCP" 2>/dev/null; then break; fi
  sleep 1
done

DOCS_LOADED="$(grep -oE 'Loaded [0-9]+ docs across [0-9]+ categories' "$LOG_MCP" | tail -1 || echo '?')"

cat <<BANNER

══════════════════════════════════════════════════════════════════════
  MCP HTTP SPIKE READY
══════════════════════════════════════════════════════════════════════

  Public URL  : ${NGROK_URL}/mcp
  Bearer token: ${SPIKE_TOKEN}
  Content     : ${CONTENT_DIR}
                ${DOCS_LOADED}

  ── Quick sanity ──────────────────────────────────────────────────
  curl -s -X POST "${NGROK_URL}/mcp" \\
    -H "Authorization: Bearer ${SPIKE_TOKEN}" \\
    -H "Content-Type: application/json" \\
    -H "Accept: application/json, text/event-stream" \\
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"spike","version":"0.0.1"}}}'

  Expected: 200 + SSE message with protocolVersion + serverInfo.
  If that works, the SDK + transport are fine — any failure on the
  hosted Vercel route is a Next.js/bridge issue, not a protocol issue.

  ── Wire into Claude Code ─────────────────────────────────────────
  claude mcp add helpbase-spike ${NGROK_URL}/mcp \\
    --transport http \\
    --header "Authorization: Bearer ${SPIKE_TOKEN}"
  claude mcp list       # expect: helpbase-spike ... ✓ Connected
  claude mcp remove helpbase-spike    # cleanup after testing

  ── Wire into Claude Desktop ──────────────────────────────────────
  Edit ~/Library/Application Support/Claude/claude_desktop_config.json
  and merge:
    "mcpServers": {
      "helpbase-spike": {
        "url": "${NGROK_URL}/mcp",
        "headers": { "Authorization": "Bearer ${SPIKE_TOKEN}" }
      }
    }
  Cmd+Q and relaunch. Tools appear in the 🔌 icon.

  ── Wire into Cursor ──────────────────────────────────────────────
  Settings → Cursor Settings → MCP → Add new MCP server
    Name      : helpbase-spike
    Type      : HTTP (or SSE if HTTP unsupported)
    URL       : ${NGROK_URL}/mcp
    Headers   : Authorization = Bearer ${SPIKE_TOKEN}

  ── Known SDK behaviour ───────────────────────────────────────────
  The SDK's StreamableHTTPServerTransport uses session IDs via the
  Mcp-Session-Id response header. Each client's first initialize
  mints its own session; multiple concurrent clients coexist fine
  — provided each echoes its own session ID back on subsequent
  requests. Real MCP clients (Claude Code 2.1.111+) handle this
  automatically; curl has to grep 'mcp-session-id' out of the init
  response headers and echo it on subsequent calls.

  ── Logs ──────────────────────────────────────────────────────────
  tail -f ${LOG_MCP}       # MCP server output (stderr)
  tail -f ${LOG_NGROK}     # ngrok tunnel events
  open http://127.0.0.1:4040  # ngrok's request inspector UI

  ── Tear down ─────────────────────────────────────────────────────
  bash scripts/mcp-http-spike.sh --kill

══════════════════════════════════════════════════════════════════════

BANNER
