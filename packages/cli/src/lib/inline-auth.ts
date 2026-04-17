import pc from "picocolors"
import { confirm, isCancel, spinner } from "@clack/prompts"
import {
  deviceLogin,
  getCurrentSession,
  isNonInteractive,
  type AuthSession,
} from "./auth.js"
import { HelpbaseError, formatError } from "./errors.js"
import { authRequiredError } from "./llm-errors-cli.js"

/**
 * Resolve the CLI's current auth session, or prompt the user to log in
 * inline if we're in a TTY.
 *
 * Flow:
 *   1. If `AI_GATEWAY_API_KEY` is set → BYOK mode; return null (caller skips auth).
 *   2. If a session already exists → return it.
 *   3. If `HELPBASE_TOKEN` is set but did not resolve to a session (invalid /
 *      expired) → throw E_AUTH_REQUIRED. We do NOT fall into an interactive
 *      prompt here: the env var signals explicit CI intent, and silently
 *      replacing it with an interactive login would mask a broken CI token.
 *   4. Else if TTY: prompt to run the browser device-flow inline so the
 *      user stays in the current command instead of bouncing to `login`.
 *   5. Else (non-TTY or declined): throw E_AUTH_REQUIRED with the exact re-run command.
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

  // No session resolved. If HELPBASE_TOKEN is set the user expressed CI
  // intent — fail cleanly rather than silently override it with an
  // interactive prompt (which would paper over a broken CI token).
  if (process.env.HELPBASE_TOKEN || isNonInteractive() || !process.stdout.isTTY) {
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
    message: `Open your browser to log in and continue with ${pc.cyan(opts.verb)}?`,
    initialValue: true,
  })
  if (isCancel(go) || !go) {
    throw authRequiredError(opts.retryCommand)
  }

  // Run the browser device-flow inline so we return a session and keep
  // the user in their current command instead of bouncing them through
  // `helpbase login` and back.
  const s = spinner()
  s.start("Requesting device authorization…")
  let session: AuthSession
  try {
    session = await deviceLogin({
      onStart: (info) => {
        s.stop("Device code ready.")
        console.log("")
        console.log(
          `  ${pc.dim("Code")}: ${pc.cyan(info.user_code)}\n` +
          `  ${pc.dim("URL")}:  ${pc.cyan(info.verification_uri_complete || info.verification_uri)}`,
        )
        console.log(
          `  ${pc.dim("If your browser didn't open, paste the URL above.")}`,
        )
        console.log("")
        s.start("Waiting for browser approval…")
      },
      onProgress: (elapsedMs) => {
        if (elapsedMs > 90_000) {
          s.message("Still waiting… check that a browser tab opened.")
        }
      },
    })
    s.stop(`Signed in as ${pc.cyan(session.email)}`)
  } catch (err) {
    s.stop("Login failed.")
    if (err instanceof HelpbaseError) {
      process.stderr.write(formatError(err))
    }
    throw authRequiredError(opts.retryCommand)
  }
  console.log(
    `  ${pc.green("✓")} Continuing with ${pc.bold(opts.verb)}...`,
  )
  console.log("")
  return { byok: false, authToken: session.accessToken, session }
}
