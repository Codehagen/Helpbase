import { Command } from "commander"
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import pc from "picocolors"

export const devCommand = new Command("dev")
  .description("Start the development server")
  .option("-p, --port <port>", "Port to run on", "3000")
  .action((opts) => {
    const pkgPath = path.resolve("package.json")
    if (!fs.existsSync(pkgPath)) {
      console.error(
        `${pc.red("✖")} No package.json in the current directory.\n` +
        `  This doesn't look like a helpbase project. To start one:\n` +
        `    ${pc.cyan("npx create-helpbase my-help-center")}\n`,
      )
      process.exit(1)
    }

    let hasNext = false
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      hasNext = Boolean(pkg.dependencies?.next || pkg.devDependencies?.next)
    } catch {
      // Let next itself report the issue if package.json is malformed.
    }

    if (!hasNext) {
      console.error(
        `${pc.red("✖")} This directory doesn't depend on Next.js.\n` +
        `  helpbase dev wraps next dev — run it from a helpbase project root.\n` +
        `  To start one: ${pc.cyan("npx create-helpbase my-help-center")}\n`,
      )
      process.exit(1)
    }

    try {
      execSync(`npx next dev --turbopack --port ${opts.port}`, {
        stdio: "inherit",
        env: { ...process.env },
      })
    } catch {
      // Ctrl+C exits with error, that's fine
    }
  })
