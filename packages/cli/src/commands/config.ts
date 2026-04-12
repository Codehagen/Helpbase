import { Command } from "commander"
import pc from "picocolors"
import { readConfig, writeConfig } from "../lib/config.js"

/**
 * `helpbase config` — read/write user-level config at ~/.helpbase/config.json.
 *
 * Current keys:
 *   telemetry    on | off    Share anonymous usage data.
 *
 * Intentionally narrow — not a general-purpose key/value store. Each known
 * key is listed explicitly so typos fail loudly and we can document
 * precisely what's supported.
 */

const KNOWN_KEYS = {
  telemetry: { values: ["on", "off"] as const },
} as const

type ConfigKey = keyof typeof KNOWN_KEYS

export const configCommand = new Command("config")
  .description("Read or write CLI preferences (~/.helpbase/config.json)")

configCommand
  .command("get <key>")
  .description("Print the current value of a config key")
  .action((key: string) => {
    if (!(key in KNOWN_KEYS)) {
      fail(key)
    }
    const cfg = readConfig()
    const value = (cfg as Record<string, unknown>)[key]
    console.log(value === undefined ? "(unset)" : String(value))
  })

configCommand
  .command("set <key> <value>")
  .description("Set a config key")
  .action((key: string, value: string) => {
    if (!(key in KNOWN_KEYS)) {
      fail(key)
    }
    const allowed = KNOWN_KEYS[key as ConfigKey].values as readonly string[]
    if (!allowed.includes(value)) {
      console.error(
        `${pc.red("✖")} Invalid value "${value}" for ${key}.\n` +
        `  Allowed: ${allowed.join(", ")}\n`,
      )
      process.exit(1)
    }
    const cfg = readConfig() as Record<string, unknown>
    cfg[key] = value
    writeConfig(cfg as Parameters<typeof writeConfig>[0])
    console.log(`${pc.green("✓")} ${key} = ${value}`)
  })

configCommand
  .command("list")
  .description("Print all known config keys and their current values")
  .action(() => {
    const cfg = readConfig() as Record<string, unknown>
    for (const key of Object.keys(KNOWN_KEYS)) {
      const v = cfg[key]
      console.log(`  ${key.padEnd(12)} ${v === undefined ? pc.dim("(unset)") : pc.cyan(String(v))}`)
    }
  })

function fail(key: string): never {
  console.error(
    `${pc.red("✖")} Unknown config key "${key}".\n` +
    `  Known keys: ${Object.keys(KNOWN_KEYS).join(", ")}\n`,
  )
  process.exit(1)
}
