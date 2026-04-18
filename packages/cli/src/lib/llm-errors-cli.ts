import pc from "picocolors"
import { HelpbaseError } from "./errors.js"
import {
  AuthRequiredError,
  GatewayError,
  GlobalCapError,
  LlmNetworkError,
  QuotaExceededError,
  humanTokens,
  humanUntil,
} from "@workspace/shared/llm-errors"

/**
 * Translate shared LLM errors into HelpbaseError with good `fix:` copy.
 *
 * The shared `packages/shared/src/llm.ts` throws pure error classes (no CLI
 * imports). This module is where we attach the prose the user sees.
 *
 * Pattern:
 *   try { await callLlmObject(...) } catch (e) { throw toCliLlmError(e, opts) }
 */

export interface ToCliLlmErrorOptions {
  /** Exact command the user ran, shown in the 429 message copy-paste. */
  retryCommand?: string
}

export function toCliLlmError(err: unknown, opts: ToCliLlmErrorOptions = {}): unknown {
  if (err instanceof HelpbaseError) return err

  if (err instanceof AuthRequiredError) return authRequiredError(opts.retryCommand)
  if (err instanceof QuotaExceededError) return quotaExceededError(err, opts.retryCommand)
  if (err instanceof GlobalCapError) return globalCapError(err)
  if (err instanceof LlmNetworkError) return llmNetworkError(err)
  if (err instanceof GatewayError) return gatewayError(err)

  return err
}

export function authRequiredError(retryCommand?: string): HelpbaseError {
  const rerun = retryCommand
    ? `After signing in, re-run: ${pc.cyan(retryCommand)}`
    : "After signing in, re-run your command."
  return new HelpbaseError({
    code: "E_AUTH_REQUIRED",
    problem: "Not signed in to helpbase.",
    fix: [
      `Run ${pc.cyan("helpbase login")} to sign in (free, no card).`,
      rerun,
      `For CI: set ${pc.cyan("HELPBASE_TOKEN")} to a session token from ${pc.cyan("helpbase login --token")}.`,
    ],
  })
}

/**
 * Shared BYOK hint line. One source of truth so every stale "Gateway-only"
 * error copy updates in lockstep when the set of accepted keys changes.
 */
function byokHint(): string {
  return (
    `Or bring your own key: ${pc.cyan("ANTHROPIC_API_KEY")}, ${pc.cyan("OPENAI_API_KEY")}, or ${pc.cyan("AI_GATEWAY_API_KEY")} ` +
    `(any one works, first found wins)`
  )
}

export function quotaExceededError(
  err: QuotaExceededError,
  retryCommand?: string,
): HelpbaseError {
  const used = humanTokens(err.usedToday)
  const cap = humanTokens(err.dailyLimit)
  const reset = humanUntil(err.resetAt)
  const rerun = retryCommand ? ` Then re-run: ${pc.cyan(retryCommand)}.` : ""
  return new HelpbaseError({
    code: "E_QUOTA_EXCEEDED",
    problem: `You've used today's free allocation (${used} / ${cap} tokens). Resets in ${reset}.`,
    fix: [
      `Join the waitlist for the paid tier → ${pc.cyan(err.upgradeUrl)}${rerun}`,
      byokHint(),
      `Docs: ${pc.cyan(err.byokDocsUrl)}`,
    ],
  })
}

export function globalCapError(err: GlobalCapError): HelpbaseError {
  const reset = humanUntil(err.resetAt)
  return new HelpbaseError({
    code: "E_GLOBAL_CAP",
    problem: `helpbase is over its daily cap. Retry in ${reset}.`,
    fix: [
      "Wait for the daily reset.",
      byokHint(),
      `Docs: ${pc.cyan(err.byokDocsUrl)}`,
    ],
  })
}

export function llmNetworkError(err: LlmNetworkError): HelpbaseError {
  return new HelpbaseError({
    code: "E_LLM_NETWORK",
    problem: "Couldn't reach helpbase.dev.",
    cause: err.message,
    fix: [
      "Check your internet connection.",
      "Retry — transient network blips are common.",
      `${byokHint()} — all three bypass the proxy.`,
    ],
  })
}

export function gatewayError(err: GatewayError): HelpbaseError {
  return new HelpbaseError({
    code: "E_LLM_GATEWAY",
    problem: "The LLM provider returned an error. No quota was consumed.",
    cause: err.message + (err.rawPreview ? `\n  raw: ${err.rawPreview.slice(0, 300)}` : ""),
    fix: [
      "Retry in a moment — transient gateway errors are common.",
      "Try a different --model (e.g. anthropic/claude-sonnet-4.6) if the issue persists.",
      "Check status.anthropic.com / openai.com.",
    ],
  })
}
