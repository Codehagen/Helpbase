import { Command } from "commander"
import { intro, outro, text, spinner, cancel, isCancel, note, confirm } from "@clack/prompts"
import pc from "picocolors"
import {
  getCurrentSession,
  isNonInteractive,
  sendLoginCode,
  verifyLoginCode,
} from "../lib/auth.js"
import { HelpbaseError, formatError } from "../lib/errors.js"
import {
  hasAskedForConsent,
  setTelemetryConsent,
} from "../lib/telemetry.js"

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
      if (err instanceof HelpbaseError) {
        cancel(formatError(err).trimEnd())
      } else {
        cancel(`Authentication error: ${String(err)}`)
      }
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
      await maybeAskTelemetryConsent()
      outro(`Logged in as ${pc.cyan(session.email)}`)
    } catch (err) {
      if (err instanceof HelpbaseError) {
        cancel(formatError(err).trimEnd())
      } else {
        cancel(`Verification failed: ${String(err)}`)
      }
      process.exit(1)
    }
  })

/**
 * Ask once, after the user's first successful login, whether they want to
 * share anonymous usage telemetry. Silent on every subsequent login.
 */
async function maybeAskTelemetryConsent(): Promise<void> {
  if (hasAskedForConsent()) return

  const choice = await confirm({
    message:
      "Share anonymous usage data? (command names + timings, no content or URLs)",
    initialValue: false,
  })
  if (isCancel(choice)) {
    setTelemetryConsent("off")
    return
  }
  setTelemetryConsent(choice ? "on" : "off")
  note(
    choice
      ? `Telemetry on. Change any time: ${pc.cyan("helpbase config set telemetry off")}`
      : `Telemetry off. Change any time: ${pc.cyan("helpbase config set telemetry on")}`,
    "Preferences",
  )
}
