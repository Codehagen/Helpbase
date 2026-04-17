import { Command } from "commander"
import { intro, outro, text, cancel, isCancel, note, confirm } from "@clack/prompts"
import { spinner, nextSteps } from "../lib/ui.js"
import pc from "picocolors"
import {
  deviceLogin,
  getCurrentSession,
  isNonInteractive,
  sendLoginCode,
  verifyLoginFromMagicLink,
} from "../lib/auth.js"
import { HelpbaseError, formatError } from "../lib/errors.js"
import {
  hasAskedForConsent,
  setTelemetryConsent,
} from "../lib/telemetry.js"

export const loginCommand = new Command("login")
  .description("Log in to helpbase cloud")
  .option("-e, --email [email]", "Use magic-link email fallback (CI / sandboxed envs)")
  .action(async (opts: { email?: string | true }) => {
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

    // Branch: --email (or --email foo@bar.com) forces the magic-link flow.
    // Without the flag, we do browser device flow (RFC 8628).
    if (opts.email !== undefined) {
      await runMagicLinkFlow(typeof opts.email === "string" ? opts.email : undefined)
      return
    }

    await runDeviceFlow()
  })

async function runDeviceFlow(): Promise<void> {
  const s = spinner()
  s.start("Requesting device authorization…")
  // Captured from onStart so the "1 minute until expiry" hint is driven
  // by the server's actual expires_in instead of a hardcoded 300s
  // assumption. onProgress runs after onStart inside deviceLogin.
  let expiresInMs: number | null = null
  try {
    const session = await deviceLogin({
      onStart: (info) => {
        expiresInMs = info.expires_in * 1000
        s.stop("Device code ready.")
        note(
          `${pc.dim("Code")}: ${pc.cyan(info.user_code)}\n` +
          `${pc.dim("URL")}:  ${pc.cyan(info.verification_uri_complete || info.verification_uri)}\n\n` +
          `${pc.dim("If your browser didn't open automatically, paste the URL above.")}\n` +
          `${pc.dim("Compare the code to what the browser shows — if they differ, cancel and retry.")}`,
          "Open your browser to authorize",
        )
        s.start("Waiting for browser approval…")
      },
      onProgress: (elapsedMs) => {
        // Progressive hints — keep the user oriented during long waits.
        if (expiresInMs !== null && elapsedMs > expiresInMs - 60_000) {
          s.message("Under 1 minute until this code expires.")
        } else if (elapsedMs > 90_000) {
          s.message(
            "Taking longer than usual. Ctrl-C to cancel, then run `helpbase login --email` for the fallback.",
          )
        } else if (elapsedMs > 30_000) {
          s.message("Still waiting… check that a browser tab opened.")
        }
      },
    })
    s.stop(`Logged in as ${pc.cyan(session.email)}`)
    await maybeAskTelemetryConsent()
    outro(`Logged in as ${pc.cyan(session.email)}`)
    nextSteps({ commands: ["helpbase whoami", "helpbase new"] })
  } catch (err) {
    s.stop("Login failed.")
    if (err instanceof HelpbaseError) {
      cancel(formatError(err).trimEnd())
    } else {
      cancel(`Login error: ${String(err)}`)
    }
    process.exit(1)
  }
}

async function runMagicLinkFlow(preset?: string): Promise<void> {
  let email = preset
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
  s.start("Sending magic link…")
  try {
    await sendLoginCode(email)
    s.stop("Magic link sent.")
  } catch (err) {
    s.stop("Failed to send magic link.")
    if (err instanceof HelpbaseError) {
      cancel(formatError(err).trimEnd())
    } else {
      cancel(`Authentication error: ${String(err)}`)
    }
    process.exit(1)
  }

  const input = await text({
    message: "Paste the magic link URL from the email:",
    placeholder: "https://helpbase.dev/api/auth/magic-link/verify?token=…",
    validate: (v) => {
      const t = v.trim()
      if (!t) return "Paste the URL"
      if (!t.startsWith("http")) return "Expected a full URL starting with http"
      return undefined
    },
  })
  if (isCancel(input)) {
    cancel("Cancelled.")
    process.exit(0)
  }

  try {
    const session = await verifyLoginFromMagicLink((input as string).trim())
    await maybeAskTelemetryConsent()
    outro(`Logged in as ${pc.cyan(session.email)}`)
    nextSteps({ commands: ["helpbase whoami", "helpbase new"] })
  } catch (err) {
    if (err instanceof HelpbaseError) {
      cancel(formatError(err).trimEnd())
    } else {
      cancel(`Verification failed: ${String(err)}`)
    }
    process.exit(1)
  }
}

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
