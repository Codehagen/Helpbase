import { Command } from "commander"
import { emit, note } from "../lib/ui.js"

/**
 * `helpbase upgrade` — print-only. Detects how helpbase is installed and
 * prints the exact command to upgrade it. Never executes the upgrade:
 * self-mutation across package managers is how CLIs brick themselves.
 * This mirrors the `gh` approach — tell the user what to run, then stop.
 */

export type InstallMethod =
  | "pnpm-global"
  | "npm-global"
  | "yarn-global"
  | "bun-global"
  | "homebrew"
  | "npx"
  | "unknown"

export interface DetectInput {
  argv1?: string
  userAgent?: string
  execPath?: string
  env?: NodeJS.ProcessEnv
}

export interface DetectResult {
  method: InstallMethod
  command: string
  label: string
}

const PACKAGE = "helpbase"

/**
 * Pure detection helper. Takes raw values instead of reading process so
 * tests can exercise every install-method branch deterministically.
 */
export function detectInstall(input: DetectInput = {}): DetectResult {
  const argv1 = input.argv1 ?? ""
  const execPath = input.execPath ?? ""
  const userAgent = input.userAgent ?? ""
  const paths = `${argv1}\n${execPath}`

  // Homebrew cellar path is unambiguous — /opt/homebrew/ on Apple Silicon,
  // /usr/local/Cellar/ on Intel Macs and Linuxbrew.
  if (/\/(Cellar|homebrew|linuxbrew)\//.test(paths)) {
    return {
      method: "homebrew",
      command: `brew upgrade ${PACKAGE}`,
      label: "Homebrew",
    }
  }

  // npx caches under ~/.npm/_npx/<hash>/; the path is the clearest signal.
  if (/\/_npx\//.test(paths) || userAgent.includes("npx")) {
    return {
      method: "npx",
      command: `npx ${PACKAGE}@latest`,
      label: "npx (no install)",
    }
  }

  // pnpm global store lives under ~/Library/pnpm, ~/.local/share/pnpm,
  // or $PNPM_HOME. argv[1] resolves through it when pnpm links the bin.
  if (/\/pnpm\/(global|nodejs)?/.test(paths) || /pnpm\/global/.test(paths) || userAgent.startsWith("pnpm")) {
    return {
      method: "pnpm-global",
      command: `pnpm up -g ${PACKAGE}`,
      label: "pnpm global",
    }
  }

  // Yarn global root is ~/.config/yarn/global on Linux, or under .yarn/.
  if (/\/\.yarn\//.test(paths) || /yarn\/global/.test(paths) || userAgent.startsWith("yarn")) {
    return {
      method: "yarn-global",
      command: `yarn global upgrade ${PACKAGE}`,
      label: "yarn global",
    }
  }

  // Bun global installs under ~/.bun/install/global.
  if (/\/\.bun\//.test(paths) || userAgent.startsWith("bun")) {
    return {
      method: "bun-global",
      command: `bun update -g ${PACKAGE}`,
      label: "bun global",
    }
  }

  // Default npm global root: lib/node_modules under node's prefix.
  if (/\/lib\/node_modules\//.test(paths) || userAgent.startsWith("npm")) {
    return {
      method: "npm-global",
      command: `npm i -g ${PACKAGE}@latest`,
      label: "npm global",
    }
  }

  return {
    method: "unknown",
    command: `npm i -g ${PACKAGE}@latest`,
    label: "unknown",
  }
}

export function formatUpgradeMessage(detected: DetectResult): string {
  return `Detected: ${detected.label}. Run: ${detected.command}`
}

export const upgradeCommand = new Command("upgrade")
  .description("Print the command to upgrade helpbase (does not execute it)")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase upgrade        # prints the detected upgrade command
`,
  )
  .action(() => {
    const detected = detectInstall({
      argv1: process.argv[1],
      execPath: process.execPath,
      userAgent: process.env.npm_config_user_agent,
      env: process.env,
    })

    emit(formatUpgradeMessage(detected))
    if (detected.method === "unknown") {
      note(
        "Couldn't detect the install method — falling back to the npm global command.",
      )
    }
  })
