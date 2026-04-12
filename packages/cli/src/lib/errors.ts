import pc from "picocolors"

/**
 * Every CLI error should print four things: problem, cause, fix, doc URL.
 * HelpbaseError + printError enforce this so we never ship a thin
 * "Something went wrong" message again.
 *
 * Doc URLs live at https://helpbase.dev/errors/<code>. Stubs exist at
 * apps/web/app/errors/[code]/page.tsx — add content there when you add a
 * new error code here.
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
  | "E_SLUG_TAKEN"
  | "E_SLUG_RESERVED"
  | "E_TENANT_NOT_FOUND"
  | "E_MISSING_API_KEY"
  | "E_NOT_A_PROJECT"

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
