import { Command } from "commander"
import { execSync } from "node:child_process"

export const devCommand = new Command("dev")
  .description("Start the development server")
  .option("-p, --port <port>", "Port to run on", "3000")
  .action((opts) => {
    try {
      execSync(`npx next dev --turbopack --port ${opts.port}`, {
        stdio: "inherit",
        env: { ...process.env },
      })
    } catch {
      // Ctrl+C exits with error, that's fine
    }
  })
