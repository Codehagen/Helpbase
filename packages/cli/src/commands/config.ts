import { Command } from "commander"
import pc from "picocolors"
import { readConfig, writeConfig, type CliConfig } from "../lib/config.js"

/**
 * `helpbase config` — read/write user-level config at ~/.helpbase/config.json.
 *
 * Known keys:
 *   telemetry        on | off          Share anonymous usage data.
 *   ai-gateway-key   <string, secret>  AI gateway key used by `helpbase
 *                                      generate`. Shell env and
 *                                      .env.local take precedence.
 *
 * Intentionally narrow — not a general-purpose key/value store. Each
 * known key is listed explicitly so typos fail loudly.
 */

type KeyDef =
  | {
      kind: "enum"
      /** Internal CliConfig field name. */
      field: keyof CliConfig
      values: readonly string[]
      secret?: false
    }
  | {
      kind: "string"
      field: keyof CliConfig
      /** Minimum length after trim. Catches typos like empty paste. */
      minLength: number
      /** Mask the value on `get` / `list` so the terminal history doesn't leak. */
      secret: true
    }

const KNOWN_KEYS: Record<string, KeyDef> = {
  telemetry: {
    kind: "enum",
    field: "telemetry",
    values: ["on", "off"],
  },
  "ai-gateway-key": {
    kind: "string",
    field: "aiGatewayApiKey",
    minLength: 8,
    secret: true,
  },
}

export const configCommand = new Command("config")
  .description("Read or write CLI preferences (~/.helpbase/config.json)")

configCommand
  .command("get <key>")
  .description("Print the current value of a config key")
  .action((key: string) => {
    const def = resolve(key)
    const cfg = readConfig()
    const value = cfg[def.field]
    if (value === undefined) {
      console.log("(unset)")
      return
    }
    console.log(def.kind === "string" && def.secret ? mask(String(value)) : String(value))
  })

configCommand
  .command("set <key> <value>")
  .description("Set a config key")
  .action((key: string, value: string) => {
    const def = resolve(key)
    if (def.kind === "enum") {
      if (!def.values.includes(value)) {
        console.error(
          `${pc.red("✖")} Invalid value "${value}" for ${key}.\n` +
          `  Allowed: ${def.values.join(", ")}\n`,
        )
        process.exit(1)
      }
    } else {
      const trimmed = value.trim()
      if (trimmed.length < def.minLength) {
        console.error(
          `${pc.red("✖")} Value for ${key} looks too short (min ${def.minLength} chars).\n`,
        )
        process.exit(1)
      }
      value = trimmed
    }
    const cfg = readConfig() as Record<string, unknown>
    cfg[def.field] = value
    writeConfig(cfg as CliConfig)
    const display = def.kind === "string" && def.secret ? mask(value) : value
    console.log(`${pc.green("✓")} ${key} = ${display}`)
  })

configCommand
  .command("unset <key>")
  .description("Clear a config key")
  .action((key: string) => {
    const def = resolve(key)
    const cfg = readConfig() as Record<string, unknown>
    delete cfg[def.field]
    writeConfig(cfg as CliConfig)
    console.log(`${pc.green("✓")} ${key} cleared`)
  })

configCommand
  .command("list")
  .description("Print all known config keys and their current values")
  .action(() => {
    const cfg = readConfig() as Record<string, unknown>
    const keyWidth = Math.max(...Object.keys(KNOWN_KEYS).map((k) => k.length))
    for (const [key, def] of Object.entries(KNOWN_KEYS)) {
      const raw = cfg[def.field]
      const formatted =
        raw === undefined
          ? pc.dim("(unset)")
          : def.kind === "string" && def.secret
            ? pc.cyan(mask(String(raw)))
            : pc.cyan(String(raw))
      console.log(`  ${key.padEnd(keyWidth)}  ${formatted}`)
    }
  })

function resolve(key: string): KeyDef {
  const def = KNOWN_KEYS[key]
  if (!def) {
    console.error(
      `${pc.red("✖")} Unknown config key "${key}".\n` +
      `  Known keys: ${Object.keys(KNOWN_KEYS).join(", ")}\n`,
    )
    process.exit(1)
  }
  return def
}

/** Mask all but first 4 + last 4 chars of a secret for display. */
function mask(v: string): string {
  if (v.length <= 10) return "••••••"
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}
