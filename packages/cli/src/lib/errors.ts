import pc from "picocolors"

/**
 * Every CLI error should print four things: problem, cause, fix, doc URL.
 * HelpbaseError + printError enforce this so we never ship a thin
 * "Something went wrong" message again.
 *
 * Doc URLs live at https://helpbase.dev/errors/<code>. Stubs exist at
 * apps/web/app/(main)/errors/[code]/page.tsx — add content there when
 * you add a new error code here.
 */

export const ERROR_DOC_BASE = "https://helpbase.dev/errors"

export type ErrorCode =
  | "E_NO_CONTENT_DIR"
  | "E_NO_ARTICLES"
  | "E_INVALID_FRONTMATTER"
  | "E_NOT_LOGGED_IN"
  | "E_AUTH_SEND_OTP"
  | "E_AUTH_VERIFY_OTP"
  | "E_AUTH_TOKEN_INVALID"
  | "E_AUTH_EXPIRED"
  | "E_SLUG_TAKEN"
  | "E_SLUG_RESERVED"
  | "E_TENANT_NOT_FOUND"
  | "E_MISSING_API_KEY"
  | "E_NOT_A_PROJECT"
  | "E_NETWORK"
  | "E_MISSING_FLAG"
  | "E_FILE_EXISTS"
  | "E_NO_GH"
  | "E_NO_CITATIONS"
  | "E_NO_HISTORY"
  | "E_INVALID_REV"
  | "E_NO_CONTENT"
  | "E_NO_MCP_TOKEN"
  | "E_CONTEXT_MISSING_KEY"
  | "E_CONTEXT_NO_SOURCES"
  | "E_CONTEXT_OVER_BUDGET"
  | "E_CONTEXT_DIRTY_TREE"
  | "E_CONTEXT_SCHEMA"
  | "E_CONTEXT_NO_VALID_CITATIONS"
  | "E_CONTEXT_SECRET"
  | "E_CONTEXT_REPO_PATH"
  | "E_CONTEXT_REUSE_WITHOUT_ASK"
  | "E_CONTEXT_REUSE_EMPTY"
  | "E_CONTEXT_PREVIEW_NO_DOCS"
  | "E_CONTEXT_PREVIEW_SCAFFOLD"
  | "E_CONTEXT_PREVIEW_INSTALL"
  | "E_CONTEXT_INVALID_BUDGET"
  | "E_CONTEXT_REFUSE_CLOBBER"
  | "E_CONTEXT_SECRET_SOURCE"
  | "E_AUTH_REQUIRED"
  | "E_QUOTA_EXCEEDED"
  | "E_GLOBAL_CAP"
  | "E_LLM_NETWORK"
  | "E_LLM_GATEWAY"
  | "E_AUTH_CANCELLED"
  | "E_DEVICE_DENIED"
  | "E_DEVICE_EXPIRED"
  | "E_DEVICE_NETWORK"
  | "E_RESERVATION_MISSING"
  | "E_RESERVATION_LOCKED"
  | "E_RESERVATION_PROVISION_FAILED"

export interface HelpbaseErrorInit {
  code: ErrorCode
  /** One-line description of what went wrong. */
  problem: string
  /** Optional: why it happened, when the cause is not obvious from the problem. */
  cause?: string
  /** What the user should do next. A single actionable line or short list. */
  fix: string | string[]
}

export class HelpbaseError extends Error {
  readonly code: ErrorCode
  readonly problem: string
  readonly cause?: string
  readonly fix: string[]

  constructor(init: HelpbaseErrorInit) {
    super(init.problem)
    this.name = "HelpbaseError"
    this.code = init.code
    this.problem = init.problem
    this.cause = init.cause
    this.fix = Array.isArray(init.fix) ? init.fix : [init.fix]
  }

  docUrl(): string {
    return `${ERROR_DOC_BASE}/${this.code.toLowerCase().replace(/_/g, "-")}`
  }
}

/** Format a HelpbaseError for stderr. Always ends with a trailing newline. */
export function formatError(err: HelpbaseError): string {
  const lines: string[] = []
  lines.push(`${pc.red("✖")} ${err.problem} ${pc.dim(`[${err.code}]`)}`)
  if (err.cause) {
    lines.push(`  ${pc.dim("cause:")} ${err.cause}`)
  }
  if (err.fix.length === 1) {
    lines.push(`  ${pc.dim("fix:")}   ${err.fix[0]}`)
  } else {
    lines.push(`  ${pc.dim("fix:")}`)
    for (const f of err.fix) lines.push(`    • ${f}`)
  }
  lines.push(`  ${pc.dim("docs:")}  ${err.docUrl()}`)
  return lines.join("\n") + "\n"
}

/**
 * Best-effort detection of network-layer failures from fetch/undici.
 * Matches node's AggregateError/Error causes, fetch TypeError, and the
 * undici cause chain (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, UND_ERR_*).
 * Keep the matcher loose — false positives here just mean a slightly
 * friendlier error message, not broken behavior.
 */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const candidates: unknown[] = [err]
  const withCause = err as { cause?: unknown }
  if (withCause.cause) candidates.push(withCause.cause)
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue
    const code = (c as { code?: string }).code
    const name = (c as { name?: string }).name
    const message = (c as { message?: string }).message ?? ""
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ETIMEDOUT" ||
      code === "EAI_AGAIN" ||
      code === "ECONNRESET" ||
      (typeof code === "string" && code.startsWith("UND_ERR_"))
    ) {
      return true
    }
    if (
      name === "FetchError" ||
      /fetch failed/i.test(message) ||
      /network request failed/i.test(message)
    ) {
      return true
    }
  }
  return false
}

/**
 * Wrap an unknown thrown value into a HelpbaseError if it looks like a
 * network failure. Returns the wrapped error or the original value.
 * Use at known HTTP/Supabase call sites:
 *   try { await fetch(...) } catch (e) { throw toNetworkError(e, "deploy") }
 */
export function toNetworkError(err: unknown, operation: string): HelpbaseError | unknown {
  if (err instanceof HelpbaseError) return err
  if (!isNetworkError(err)) return err
  const detail = err instanceof Error ? err.message : String(err)
  return new HelpbaseError({
    code: "E_NETWORK",
    problem: `Could not reach helpbase while running '${operation}'`,
    cause: detail,
    fix: [
      "Check your internet connection.",
      `Retry in a moment — '${operation}' is safe to re-run.`,
    ],
  })
}

/**
 * Print a HelpbaseError and exit 1. Also accepts a plain Error for safety;
 * in that case we print the message without the doc URL and still exit 1.
 */
export function exitWithError(err: unknown): never {
  if (err instanceof HelpbaseError) {
    process.stderr.write(formatError(err))
  } else {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`${pc.red("✖")} ${msg}\n`)
  }
  process.exit(1)
}
