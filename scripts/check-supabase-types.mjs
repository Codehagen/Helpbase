#!/usr/bin/env node
/**
 * Drift check for apps/web/types/supabase.ts.
 *
 * Goal: CI fails if someone adds a new table / column / RPC to the Supabase
 * schema without regenerating the TypeScript types. This is the cheap guard
 * proposed during /plan-eng-review to prevent the "frontmatter-schema in
 * four places" class of drift that bit the team before.
 *
 * What it checks:
 *   1. File exists and is readable.
 *   2. All required tables are declared (name-level only, not column-level).
 *   3. The `deploy_tenant` RPC signature is declared in Functions.
 *
 * What it does NOT check:
 *   - Column-level drift (would need a live Supabase connection).
 *   - RLS policies.
 *   - Triggers / constraints.
 *
 * Column-level drift is a v1.5 upgrade: add a CI step that runs
 * `supabase gen types` against a staging DB and fails on any diff. For v1,
 * table-level checks catch 80% of drift at 5% of the cost.
 *
 * Run: `node scripts/check-supabase-types.mjs` (exit 0 = pass, 1 = fail).
 */

import fs from "node:fs"
import path from "node:path"

const TYPES_PATH = path.resolve(
  new URL(".", import.meta.url).pathname,
  "..",
  "apps/web/types/supabase.ts",
)

const REQUIRED_TABLES = [
  "tenants",
  "tenant_articles",
  "tenant_categories",
  "tenant_chunks",
  "tenant_deploys",
  "tenant_mcp_queries",
  "llm_usage_events_ci",
]

const REQUIRED_RPCS = ["deploy_tenant", "get_repo_tokens_today"]

const REQUIRED_COLUMNS = {
  tenants: ["mcp_public_token", "mcp_calls_today", "owner_id", "slug", "active"],
  tenant_chunks: ["fts", "line_start", "line_end", "article_id"],
  tenant_deploys: ["validation_report", "dropped_count", "deploy_id"],
  tenant_mcp_queries: ["tool_name", "query", "result_count", "matched"],
  llm_usage_events_ci: ["repo_id", "repo_slug", "owner", "event_name", "total_tokens"],
}

function fail(msg) {
  console.error(`✖ ${msg}`)
  console.error(
    `\nFix: regenerate types from the live Supabase project, e.g.\n` +
    `  supabase gen types typescript --project-id <ref> > apps/web/types/supabase.ts\n` +
    `  (or use the Supabase MCP generate_typescript_types tool)\n`,
  )
  process.exit(1)
}

if (!fs.existsSync(TYPES_PATH)) {
  fail(`Types file not found at ${TYPES_PATH}`)
}

const source = fs.readFileSync(TYPES_PATH, "utf-8")
const issues = []

for (const table of REQUIRED_TABLES) {
  // The generator outputs e.g. `tenant_articles: {` inside the Tables block.
  if (!new RegExp(`\\b${table}:\\s*\\{`).test(source)) {
    issues.push(`missing table: ${table}`)
  }
}

for (const rpc of REQUIRED_RPCS) {
  if (!new RegExp(`\\b${rpc}:\\s*\\{\\s*Args:`).test(source)) {
    issues.push(`missing RPC in Functions: ${rpc}`)
  }
}

for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
  for (const col of columns) {
    // Loose check: each column name appears somewhere in the file.
    // Good enough for v1; the stricter per-table check is v1.5.
    if (!source.includes(col)) {
      issues.push(`missing column (looks like schema drift): ${table}.${col}`)
    }
  }
}

if (issues.length > 0) {
  console.error(`${issues.length} issue(s) in apps/web/types/supabase.ts:`)
  for (const i of issues) console.error(`  • ${i}`)
  fail("Supabase types are out of sync with the expected schema")
}

console.log(
  `✓ apps/web/types/supabase.ts declares ${REQUIRED_TABLES.length} tables + ` +
  `${REQUIRED_RPCS.length} RPC(s) + ` +
  `${Object.values(REQUIRED_COLUMNS).flat().length} tracked columns`,
)
