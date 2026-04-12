import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { randomUUID } from "node:crypto"

/**
 * User-level CLI config. Lives alongside auth.json at ~/.helpbase/config.json
 * and stores cross-session preferences: telemetry consent, anon id, etc.
 *
 * Never store anything project-specific here — that goes in
 * .helpbase/project.json.
 */

export interface CliConfig {
  /** "on" | "off" | undefined. undefined means the user has never been asked. */
  telemetry?: "on" | "off"
  /** Random UUID generated on first write. Lets us count unique installs. */
  anonId?: string
}

// Resolve at call time so tests can override via $HOME. os.homedir() on
// POSIX reads from getpwuid(), NOT $HOME — setting process.env.HOME alone
// would not redirect config writes. We prefer env first, fall back to
// os.homedir() for real use.
function configDir(): string {
  const home = process.env.HOME ?? os.homedir()
  return path.join(home, ".helpbase")
}
function configFile(): string {
  return path.join(configDir(), "config.json")
}

export function readConfig(): CliConfig {
  const file = configFile()
  if (!fs.existsSync(file)) return {}
  try {
    const raw = fs.readFileSync(file, "utf-8")
    const parsed = JSON.parse(raw) as CliConfig
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function writeConfig(next: CliConfig): void {
  const dir = configDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configFile(), JSON.stringify(next, null, 2), { mode: 0o600 })
}

/** Get or lazily create the anonymous install id. */
export function getOrCreateAnonId(): string {
  const cfg = readConfig()
  if (cfg.anonId) return cfg.anonId
  const id = randomUUID()
  writeConfig({ ...cfg, anonId: id })
  return id
}
