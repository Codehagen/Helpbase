#!/usr/bin/env node
/**
 * Hosted MCP vs stdio MCP structural parity eval.
 *
 * The question this script answers: "Does the hosted /{slug}/mcp endpoint
 * return the same tool outputs for the same tool calls as the stdio
 * @helpbase/mcp binary run over the same content?"
 *
 * It's a structural gate, not an LLM-graded quality eval — the full
 * question-and-answer eval lives in runner.ts and grades generation
 * quality. This script only checks that the hosted wire + SDK bridge
 * don't silently degrade tool outputs vs the stdio baseline. That is
 * enough to catch regressions like "MCP route dropped the Accept
 * header and every tool call returned 406" (which c91b9e4 shipped and
 * abebfd3 fixed).
 *
 * Threshold: hosted ≥ stdio × 0.95 (ship-gate). Below that, the hosted
 * bridge is doing something to the tool outputs and the commit should
 * not land.
 *
 * Requires:
 *   HOSTED_MCP_URL          e.g. https://smoke-dogfood.helpbase.dev/mcp
 *   HOSTED_MCP_TOKEN        Bearer token minted by `helpbase deploy`
 *   HOSTED_CONTENT_DIR      Local path to the same content tree the
 *                           hosted tenant was deployed from. Required
 *                           for the probes to match — if the dirs are
 *                           out of sync, parity trivially fails.
 *
 * Skips gracefully (exit 0 with a skip message) when any env is unset,
 * so the local `pnpm smoke` suite stays quiet for devs without the
 * hosted secrets.
 *
 * Usage:
 *   HOSTED_MCP_URL=... HOSTED_MCP_TOKEN=... HOSTED_CONTENT_DIR=... \
 *     node packages/cli/eval/run-hosted-parity.mjs
 */

import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "../../..")
const STDIO_BIN = path.join(REPO_ROOT, "packages/mcp/dist/index.js")

const THRESHOLD_RATIO = 0.95

function skip(reason) {
  console.log(`⊘ hosted-parity eval skipped: ${reason}`)
  process.exit(0)
}

const HOSTED_MCP_URL = process.env.HOSTED_MCP_URL
const HOSTED_MCP_TOKEN = process.env.HOSTED_MCP_TOKEN
const HOSTED_CONTENT_DIR = process.env.HOSTED_CONTENT_DIR

if (!HOSTED_MCP_URL) skip("HOSTED_MCP_URL not set")
if (!HOSTED_MCP_TOKEN) skip("HOSTED_MCP_TOKEN not set")
if (!HOSTED_CONTENT_DIR) skip("HOSTED_CONTENT_DIR not set")
if (!fs.existsSync(STDIO_BIN)) {
  console.error(`✖ stdio MCP binary not built at ${STDIO_BIN}`)
  console.error(`  Run: pnpm --filter @helpbase/mcp build`)
  process.exit(1)
}
if (!fs.existsSync(HOSTED_CONTENT_DIR)) {
  console.error(`✖ HOSTED_CONTENT_DIR does not exist: ${HOSTED_CONTENT_DIR}`)
  process.exit(1)
}

/**
 * Stateful handle on a spawned stdio MCP server. Keeps one child per
 * harness run; one-shot clients are a waste given we issue several
 * probes in sequence.
 */
function startStdio() {
  const child = spawn(process.execPath, [STDIO_BIN], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      HELPBASE_CONTENT_DIR: HOSTED_CONTENT_DIR,
    },
  })
  const stderrChunks = []
  child.stderr.on("data", (c) => stderrChunks.push(c))

  let buf = ""
  const pending = new Map()
  let nextId = 1

  child.stdout.on("data", (c) => {
    buf += c.toString()
    let newline
    while ((newline = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, newline).trim()
      buf = buf.slice(newline + 1)
      if (!line) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        continue // non-JSON log line from the server — ignore
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(new Error(`stdio MCP error: ${JSON.stringify(msg.error)}`))
        else resolve(msg.result)
      }
    }
  })

  function request(method, params) {
    const id = nextId++
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
    child.stdin.write(payload)
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(
            new Error(
              `stdio MCP timeout on ${method}. stderr:\n${Buffer.concat(stderrChunks).toString()}`,
            ),
          )
        }
      }, 15_000)
    })
  }

  function notify(method, params) {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"
    child.stdin.write(payload)
  }

  function close() {
    child.stdin.end()
    child.kill("SIGTERM")
  }

  return { request, notify, close }
}

/**
 * Hosted MCP via plain HTTP. Parses `event: message / data: {...}` SSE
 * frames because the SDK's Streamable HTTP transport answers POSTs in
 * SSE format even for single-response JSON-RPC calls.
 */
async function hostedRequest(method, params) {
  const res = await fetch(HOSTED_MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HOSTED_MCP_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`hosted MCP HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  const body = await res.text()
  const dataLine = body.split("\n").find((l) => l.startsWith("data: "))
  if (!dataLine) {
    throw new Error(`hosted MCP returned no data line. body: ${body.slice(0, 400)}`)
  }
  const parsed = JSON.parse(dataLine.slice("data: ".length))
  if (parsed.error) {
    throw new Error(`hosted MCP error: ${JSON.stringify(parsed.error)}`)
  }
  return parsed.result
}

/** Extract the text content out of an MCP tools/call result envelope. */
function extractText(toolResult) {
  if (!toolResult?.content || !Array.isArray(toolResult.content)) return ""
  return toolResult.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n")
}

/**
 * Collect all slugs referenced in a search_docs / list_docs text body.
 *
 * Matches both formats the server emits today:
 *   search_docs / get_doc: `- [category/slug] Title — Description`
 *   list_docs:             `- category/slug: Title — Description`
 *
 * If the server ever changes these templates, update both regexes together.
 */
function extractSlugs(text) {
  const slugs = []
  const bracketed = /\[([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)\]/gi
  const bulleted = /(?:^|\n)\s*-\s+([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)\s*:/gi
  for (const re of [bracketed, bulleted]) {
    let m
    while ((m = re.exec(text)) !== null) slugs.push(m[1].toLowerCase())
  }
  // Preserve the first-seen order per slug; dedupe; keep input order so
  // "top slug" comparisons stay stable.
  const seen = new Set()
  const ordered = []
  for (const s of slugs) {
    if (!seen.has(s)) {
      seen.add(s)
      ordered.push(s)
    }
  }
  return ordered
}

/** Compare two numbers with a relative tolerance. */
function withinRatio(a, b, tolerance = 0.1) {
  if (a === 0 && b === 0) return true
  const denom = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / denom <= tolerance
}

const probes = [
  {
    id: "list_docs/total",
    description: "list_docs returns the same slug set on both paths",
    async run({ stdio, hosted }) {
      const [s, h] = await Promise.all([
        stdio.request("tools/call", { name: "list_docs", arguments: {} }),
        hosted("tools/call", { name: "list_docs", arguments: {} }),
      ])
      const ss = [...extractSlugs(extractText(s))].sort()
      const hs = [...extractSlugs(extractText(h))].sort()
      const match =
        ss.length > 0 &&
        ss.length === hs.length &&
        ss.every((slug, i) => slug === hs[i])
      return {
        match,
        detail: `stdio=${ss.length} docs, hosted=${hs.length} docs; slug overlap ${
          ss.filter((x) => hs.includes(x)).length
        }/${Math.max(ss.length, hs.length)}`,
      }
    },
  },
  {
    id: "search_docs/hello",
    description: 'search_docs({query:"Hello"}) returns the same top slug',
    async run({ stdio, hosted }) {
      const args = { query: "Hello", limit: 5 }
      const [s, h] = await Promise.all([
        stdio.request("tools/call", { name: "search_docs", arguments: args }),
        hosted("tools/call", { name: "search_docs", arguments: args }),
      ])
      const ss = extractSlugs(extractText(s))
      const hs = extractSlugs(extractText(h))
      const match = ss.length > 0 && hs.length > 0 && ss[0] === hs[0]
      return {
        match,
        detail: `stdio top=${ss[0] ?? "(none)"}, hosted top=${hs[0] ?? "(none)"}`,
      }
    },
  },
  {
    id: "get_doc/first",
    description: "get_doc on the first listed slug returns ~same-size content",
    async run({ stdio, hosted }) {
      // Ask stdio for the slug list first so we probe a slug we know exists.
      const listResult = await stdio.request("tools/call", {
        name: "list_docs",
        arguments: {},
      })
      const slugs = extractSlugs(extractText(listResult))
      if (slugs.length === 0) {
        return { match: false, detail: "stdio list_docs returned no slugs" }
      }
      const targetSlug = slugs[0]
      const args = { slug: targetSlug }
      const [s, h] = await Promise.all([
        stdio.request("tools/call", { name: "get_doc", arguments: args }),
        hosted("tools/call", { name: "get_doc", arguments: args }),
      ])
      const sText = extractText(s)
      const hText = extractText(h)
      const match = sText.length > 0 && hText.length > 0 && withinRatio(sText.length, hText.length, 0.15)
      return {
        match,
        detail: `slug=${targetSlug}, stdio=${sText.length}B, hosted=${hText.length}B`,
      }
    },
  },
  {
    id: "search_docs/missing",
    description: "search_docs for gibberish yields 0 matches on both paths",
    async run({ stdio, hosted }) {
      const args = { query: "zxqvbnmplkjhgfdsapoiuytrewq", limit: 5 }
      const [s, h] = await Promise.all([
        stdio.request("tools/call", { name: "search_docs", arguments: args }),
        hosted("tools/call", { name: "search_docs", arguments: args }),
      ])
      const sSlugs = extractSlugs(extractText(s))
      const hSlugs = extractSlugs(extractText(h))
      const match = sSlugs.length === 0 && hSlugs.length === 0
      return {
        match,
        detail: `stdio=${sSlugs.length} matches, hosted=${hSlugs.length} matches`,
      }
    },
  },
]

async function main() {
  const stdio = startStdio()

  // Handshake the stdio transport. The hosted side is stateless so it
  // doesn't require an initialize before tools/call, but the stdio
  // Server instance does.
  await stdio.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "hosted-parity", version: "0.0.1" },
  })
  stdio.notify("notifications/initialized", {})

  const results = []
  for (const probe of probes) {
    const started = Date.now()
    try {
      const { match, detail } = await probe.run({ stdio, hosted: hostedRequest })
      results.push({
        id: probe.id,
        description: probe.description,
        match,
        detail,
        durationMs: Date.now() - started,
      })
      console.log(
        `  [${probe.id}] ${match ? "✓" : "✗"} ${detail}  (${Date.now() - started}ms)`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        id: probe.id,
        description: probe.description,
        match: false,
        detail: `error: ${message}`,
        durationMs: Date.now() - started,
      })
      console.log(`  [${probe.id}] ✗ error: ${message}`)
    }
  }

  stdio.close()

  const matched = results.filter((r) => r.match).length
  const ratio = matched / results.length
  const report = {
    hosted_url: HOSTED_MCP_URL,
    content_dir: HOSTED_CONTENT_DIR,
    threshold: THRESHOLD_RATIO,
    ratio,
    matched,
    total: results.length,
    passed: ratio >= THRESHOLD_RATIO,
    results,
    completedAt: new Date().toISOString(),
  }
  const reportPath = path.join(__dirname, "hosted-parity-report.json")
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log("")
  console.log(
    `parity=${(ratio * 100).toFixed(1)}% (${matched}/${results.length}) — ${
      report.passed ? "PASS" : "FAIL"
    } (threshold ${(THRESHOLD_RATIO * 100).toFixed(0)}%)`,
  )
  console.log(`report: ${reportPath}`)
  process.exit(report.passed ? 0 : 1)
}

main().catch((err) => {
  console.error("✖ hosted-parity eval crashed:")
  console.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(1)
})
