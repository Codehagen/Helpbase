import pc from "picocolors"
import { confirm, isCancel } from "@clack/prompts"
import {
  getCurrentSession,
  sendLoginCode,
  verifyLoginCode,
  isNonInteractive,
  type AuthSession,
} from "./auth.js"
import { HelpbaseError } from "./errors.js"
import { text } from "@clack/prompts"
import { quotaExceededError, authRequiredError } from "./llm-errors-cli.js"

/**
 * Resolve the CLI's current auth session, or prompt the user to log in
 * inline if we're in a TTY.
 *
 * Flow:
 *   1. If `AI_GATEWAY_API_KEY` is set → BYOK mode; return null (caller skips auth).
 *   2. If a session already exists → return it.
 *   3. If `HELPBASE_TOKEN` is set but invalid → throw E_AUTH_REQUIRED (CI flow).
 *   4. If TTY: prompt "Not signed in. Run helpbase login now? (Y/n)" → inline OTP.
 *   5. If non-TTY or declined: throw E_AUTH_REQUIRED with the exact re-run command.
 */
export interface ResolveAuthOptions {
  /** Verb shown in the prompt, e.g. "generate", "sync", "ask". */
  verb: string
  /** Exact command to re-run post-login, used in non-TTY error copy. */
  retryCommand?: string
}

export interface ResolveAuthResult {
  /** Session token to pass to `callLlm*`. Undefined when BYOK is active. */
  authToken?: string
  /** Resolved session (when hosted). */
  session?: AuthSession
  /** True when AI_GATEWAY_API_KEY is in env. */
  byok: boolean
}

export async function resolveAuthOrPromptLogin(
  opts: ResolveAuthOptions,
): Promise<ResolveAuthResult> {
  if (process.env.AI_GATEWAY_API_KEY) {
    return { byok: true }
  }

  const existing = await getCurrentSession()
  if (existing) {
    return { byok: false, authToken: existing.accessToken, session: existing }
  }

  // No session. In non-interactive mode, error with a clean next step.
  if (isNonInteractive() || !process.stdout.isTTY) {
    throw authRequiredError(opts.retryCommand)
  }

  // TTY: prompt inline.
  console.log("")
  console.log(
    `  ${pc.yellow("●")} You're not signed in to helpbase.`,
  )
  console.log(
    `    ${pc.dim("helpbase")} is free to use ${pc.dim("(no credit card, 500k tokens/day)")}.`,
  )
  console.log("")

  const go = await confirm({
    message: `Run ${pc.cyan("helpbase login")} now and continue?`,
    initialValue: true,
  })
  if (isCancel(go) || !go) {
    throw authRequiredError(opts.retryCommand)
  }

  // Run the OTP flow inline, without dispatching the full `login` command
  // so we return a session instead of printing its success message twice.
  const email = await text({
    message: "Enter your email:",
    placeholder: "you@company.com",
    validate: (v) => (v.includes("@") ? undefined : "Please enter a valid email"),
  })
  if (isCancel(email)) throw authRequiredError(opts.retryCommand)

  await sendLoginCode(email as string)

  const code = await text({
    message: "Enter the 6-digit code from your email:",
    placeholder: "123456",
    validate: (v) => (/^\d{6}$/.test(v) ? undefined : "Enter the 6-digit code"),
  })
  if (isCancel(code)) throw authRequiredError(opts.retryCommand)

  const session = await verifyLoginCode(email as string, code as string)
  console.log(
    `  ${pc.green("✓")} Signed in as ${pc.cyan(session.email)}. Continuing with ${pc.bold(opts.verb)}...`,
  )
  console.log("")
  return { byok: false, authToken: session.accessToken, session }
}
