import { Command } from "commander"
import { intro, outro, text, cancel, isCancel, note, confirm } from "@clack/prompts"
import { spinner, nextSteps } from "../lib/ui.js"
import pc from "picocolors"
import {
  getCurrentSession,
  isNonInteractive,
  sendLoginCode,
  verifyLoginCode,
  verifyLoginFromMagicLink,
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

    const input = await text({
      message: "Paste the magic link URL from the email (or the 6-digit code, if your template shows one):",
      placeholder: "https://helpbase.dev/#access_token=... or 123456",
      validate: (v) => {
        const t = v.trim()
        if (!t) return "Paste the URL or code"
        if (t.startsWith("http")) return undefined
        if (/^\d{6}$/.test(t)) return undefined
        return "Expected a full URL starting with http or a 6-digit code"
      },
    })
    if (isCancel(input)) {
      cancel("Cancelled.")
      process.exit(0)
    }

    const trimmed = (input as string).trim()

    try {
      const session = trimmed.startsWith("http")
        ? verifyLoginFromMagicLink(trimmed)
        : await verifyLoginCode(email, trimmed)
      await maybeAskTelemetryConsent()
      outro(`Logged in as ${pc.cyan(session.email)}`)
      nextSteps({ commands: ["helpbase link", "helpbase new"] })
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
