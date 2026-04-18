import { getOrCreateAnonId, readConfig, writeConfig } from "./config.js"

/**
 * Opt-in CLI telemetry.
 *
 * First interactive run: we ask once (see commands/login.ts) whether to
 * share anonymous usage data. Consent stored in ~/.helpbase/config.json.
 *
 * What we send: command name, duration, exit code, flag NAMES (not values),
 * CLI version, Node version, platform, arch, plus a random install-id
 * (anon_id). That's it.
 *
 * What we NEVER send: content, URLs, emails, slugs, file paths, arg values,
 * error messages, tokens.
 *
 * Disable at any time:
 *   • `helpbase config set telemetry off`  (writes to config.json)
 *   • `HELPBASE_TELEMETRY=off` (env, per-command override)
 *   • CI=true or any non-TTY environment — we never prompt or send there.
 */

const ENDPOINT = process.env.HELPBASE_TELEMETRY_ENDPOINT
  ?? "https://helpbase.dev/api/telemetry"

export interface TelemetryEvent {
  command: string
  durationMs: number
  exitCode: number
  /** Flag names actually used (e.g. "--slug", "--yes"). Never values. */
  flags: string[]
  /**
   * If the user invoked a deprecated alias (e.g. `helpbase context` for the
   * `ingest` command), `command` is the canonical name and `alias` is what
   * they actually typed. Preserves metric continuity across renames while
   * still surfacing the alias-adoption rate. Optional so non-alias calls
   * stay the same shape. Server-side consumers that don't know this field
   * can ignore it safely.
   */
  alias?: string
}

export function isTelemetryEnabled(): boolean {
  if (process.env.HELPBASE_TELEMETRY === "off") return false
  if (process.env.NO_TELEMETRY === "1") return false
  const cfg = readConfig()
  return cfg.telemetry === "on"
}

export function setTelemetryConsent(choice: "on" | "off"): void {
  const cfg = readConfig()
  writeConfig({ ...cfg, telemetry: choice })
}

export function hasAskedForConsent(): boolean {
  const cfg = readConfig()
  return cfg.telemetry !== undefined
}

/**
 * Fire-and-forget. Never blocks the CLI, never throws, never logs failures
 * to the user. If the endpoint is down or the network is slow, we just
 * move on — telemetry isn't important enough to annoy anyone with.
 */
export function sendEvent(event: TelemetryEvent, cliVersion: string): void {
  if (!isTelemetryEnabled()) return

  const payload = {
    anonId: getOrCreateAnonId(),
    command: event.command,
    durationMs: event.durationMs,
    exitCode: event.exitCode,
    flags: event.flags,
    cliVersion,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    // Only present when the user invoked via a deprecated alias. Lets
    // dashboards track rename-migration progress without double-counting.
    ...(event.alias ? { alias: event.alias } : {}),
  }

  // 2 second timeout — telemetry must never slow users down.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)

  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .catch(() => {
      // swallow every error — offline, dns, endpoint down, etc.
    })
    .finally(() => clearTimeout(timer))
}
