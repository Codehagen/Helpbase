import fs from "node:fs"
import path from "node:path"
import { readConfig } from "./config.js"

/**
 * Auto-load .env.local then .env, walking up from cwd until we find a
 * project root (package.json) or hit `/`. Matches Next.js priority:
 *
 *   .env.local  (highest, dev/prod secrets)
 *   .env        (shared defaults, safe to commit)
 *
 * Existing process.env values always win. This is a paper-cut fix: every
 * helpbase user keeps AI_GATEWAY_API_KEY in .env.local because that's what
 * Next.js wants. Forcing them to `export` before running CLI commands is
 * the exact kind of friction the DX pass exists to kill.
 *
 * Zero deps, minimal parser. Supports:
 *   KEY=value
 *   KEY="quoted value"
 *   KEY='quoted value'
 *   # comments
 * Does NOT expand ${VAR} references (Next.js doesn't either in .env.local
 * by default; if we ever need it, dotenv-expand is the call).
 */

const MAX_DIR_DEPTH = 16 // stop climbing at some point, even on exotic layouts

export interface LoadedEnvFile {
  path: string
  loaded: number // how many new keys it contributed
}

export function loadEnvFiles(startDir: string = process.cwd()): LoadedEnvFile[] {
  const root = findProjectRoot(startDir)
  const files = [
    path.join(root, ".env.local"),
    path.join(root, ".env"),
  ]

  const loaded: LoadedEnvFile[] = []
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    const applied = applyEnvFile(file)
    if (applied > 0 || fs.existsSync(file)) {
      loaded.push({ path: file, loaded: applied })
    }
  }

  // Last-resort fallback: ~/.helpbase/config.json. Only fills keys that
  // shell env + .env files didn't already provide. Lets users run
  // `helpbase generate` from any directory after a one-time
  // `helpbase config set ai-gateway-key <key>`.
  applyConfigFallback()

  return loaded
}

function applyConfigFallback(): void {
  try {
    const cfg = readConfig()
    if (cfg.aiGatewayApiKey && process.env.AI_GATEWAY_API_KEY === undefined) {
      process.env.AI_GATEWAY_API_KEY = cfg.aiGatewayApiKey
    }
  } catch {
    // A corrupt config shouldn't break the CLI. readConfig() already
    // swallows parse errors; this catch is just belt-and-suspenders.
  }
}

/** Walk up from `start` until we find a package.json or hit `/`. */
function findProjectRoot(start: string): string {
  let dir = path.resolve(start)
  for (let i = 0; i < MAX_DIR_DEPTH; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return start // fell off the root; keep original cwd
    dir = parent
  }
  return start
}

/**
 * Apply a .env file to process.env without overriding existing keys.
 * Returns the number of new keys set. Parse errors are silent — a broken
 * .env file shouldn't crash `helpbase --help`.
 */
function applyEnvFile(file: string): number {
  let contents: string
  try {
    contents = fs.readFileSync(file, "utf-8")
  } catch {
    return 0
  }

  let applied = 0
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    if (process.env[key] !== undefined) continue // shell wins

    let value = line.slice(eq + 1).trim()
    // Strip matching surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // Strip inline comments only for unquoted values.
    // (Dotenv's behavior varies; we err on the side of literal values.)
    process.env[key] = value
    applied++
  }
  return applied
}
