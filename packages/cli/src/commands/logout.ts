import { Command } from "commander"
import pc from "picocolors"
import { getCurrentSession, isNonInteractive, logout } from "../lib/auth.js"

export const logoutCommand = new Command("logout")
  .description("Log out of helpbase cloud")
  .action(async () => {
    if (isNonInteractive()) {
      console.error(
        `${pc.red("✖")} HELPBASE_TOKEN is set in the environment — logout only clears the local login.\n` +
        `  Unset HELPBASE_TOKEN to fully log out.\n`,
      )
      process.exit(1)
    }

    const existing = await getCurrentSession()
    if (!existing) {
      console.log(`${pc.dim("›")} Not logged in.`)
      return
    }

    logout()
    console.log(`${pc.green("✓")} Logged out ${pc.dim(`(${existing.email})`)}`)
  })
