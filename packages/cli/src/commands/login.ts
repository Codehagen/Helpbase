import { Command } from "commander"
import { intro, outro, text, spinner, cancel, isCancel, note } from "@clack/prompts"
import pc from "picocolors"
import {
  AuthError,
  getCurrentSession,
  isNonInteractive,
  sendLoginCode,
  verifyLoginCode,
} from "../lib/auth.js"

export const loginCommand = new Command("login")
  .description("Log in to helpbase cloud")
  .option("-e, --email <email>", "Email address (skips the prompt)")
  .action(async (opts: { email?: string }) => {
    if (isNonInteractive()) {
      console.error(
        `${pc.red("✖")} HELPBASE_TOKEN is set — you're already authenticated for non-interactive use.\n` +
        `  Run ${pc.cyan("helpbase whoami")} to verify, or unset HELPBASE_TOKEN to log in interactively.\n`,
      )
      process.exit(1)
    }

    const existing = await getCurrentSession()
    if (existing) {
      note(
        `Already logged in as ${pc.cyan(existing.email)}.\n` +
        `Run ${pc.cyan("helpbase logout")} first if you want to switch accounts.`,
        "Authentication",
      )
      return
    }

    intro(pc.bgCyan(pc.black(" helpbase login ")))

    let email = opts.email
    if (!email) {
      const input = await text({
        message: "Enter your email:",
        placeholder: "you@company.com",
        validate: (v) => {
          if (!v.includes("@")) return "Please enter a valid email"
          return undefined
        },
      })
      if (isCancel(input)) {
        cancel("Cancelled.")
        process.exit(0)
      }
      email = input as string
    }

    const s = spinner()
    s.start("Sending magic link...")
    try {
      await sendLoginCode(email)
      s.stop("Magic link sent!")
    } catch (err) {
      s.stop("Failed to send magic link")
      const msg = err instanceof AuthError ? err.message : String(err)
      cancel(`Authentication error: ${msg}`)
      process.exit(1)
    }

    const code = await text({
      message: "Enter the 6-digit code from your email:",
      placeholder: "123456",
      validate: (v) => {
        if (!/^\d{6}$/.test(v)) return "Enter the 6-digit code"
        return undefined
      },
    })
    if (isCancel(code)) {
      cancel("Cancelled.")
      process.exit(0)
    }

    try {
      const session = await verifyLoginCode(email, code as string)
      outro(`Logged in as ${pc.cyan(session.email)}`)
    } catch (err) {
      const msg = err instanceof AuthError ? err.message : String(err)
      cancel(
        `Verification failed: ${msg}\n` +
        `  Run ${pc.cyan("helpbase login")} again to get a new code, or check your spam folder.`,
      )
      process.exit(1)
    }
  })
