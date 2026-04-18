import { confirm, isCancel } from "@clack/prompts"

/**
 * Thrown when `--deploy` is combined with `--source skip` in a
 * non-interactive context. The caller should print this error's message
 * verbatim via `cancel()` and exit 1 — the user's intent ("publish
 * sample content to a real subdomain") is almost always a mistake (e.g.
 * CI that uses `--source skip` as a placeholder). Exported so callers
 * can match on the instance rather than error message text.
 */
export class ShipItNowRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ShipItNowRefusedError"
  }
}

/**
 * Tri-state resolver for the ship-it-now prompt (Shape A, 2026-04-18).
 * Pure (no I/O beyond the clack confirm when we actually prompt), so
 * smoke tests cover every branch without spawning real subprocesses.
 *
 * Precedence:
 *   1. `--no-deploy` → no deploy. Explicit user opt-out wins over anything.
 *   2. `--deploy` + `sourceKind === "skip"`:
 *      - non-interactive → throw ShipItNowRefusedError. Publishing sample
 *        content to a public subdomain from CI is almost always a
 *        mistake; the user has to drop one of the two flags explicitly.
 *      - interactive → extra confirm (initialValue: false) so the user
 *        re-acknowledges "yes, really publish lorem ipsum."
 *   3. `--deploy` (any other source) → deploy.
 *   4. `sourceKind === "skip"` (no flag) → no deploy. Sample content
 *      should not auto-ship.
 *   5. Non-interactive (no flag, no TTY) → no deploy. Silent default
 *      keeps CI + piped usage on today's behavior.
 *   6. AI generation failed → no deploy. Sample content remains, same
 *      reasoning as rule 4.
 *   7. Otherwise → prompt.
 *
 * Lives in its own module so importing it from tests does not trigger
 * the commander program.parse() side effect in src/index.ts.
 */
export async function resolveShipItNow(opts: {
  flagDeploy: boolean | undefined
  sourceKind: "url" | "repo" | "skip"
  isInteractive: boolean
  generationSucceeded: boolean
  promptFn?: typeof confirm
}): Promise<boolean> {
  if (opts.flagDeploy === false) return false

  const prompt = opts.promptFn ?? confirm

  if (opts.flagDeploy === true) {
    if (opts.sourceKind === "skip") {
      if (!opts.isInteractive) {
        throw new ShipItNowRefusedError(
          "Refusing to publish sample content with --deploy. " +
            "Either drop --source skip (use --source <url|repo> to generate real articles), " +
            "or drop --deploy.",
        )
      }
      const ok = await prompt({
        message:
          "Publish SAMPLE content to your public subdomain? Run with --source <url|repo> to generate real articles first",
        initialValue: false,
      })
      if (isCancel(ok)) return false
      return ok === true
    }
    return true
  }

  if (!opts.isInteractive) return false
  if (opts.sourceKind === "skip") return false
  if (!opts.generationSucceeded) return false

  const answer = await prompt({
    message: "Ship it to helpbase cloud? (~20 seconds)",
    initialValue: true,
  })
  if (isCancel(answer)) return false
  return answer === true
}
