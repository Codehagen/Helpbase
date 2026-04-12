import { Command } from "commander"
import { HelpbaseError } from "../lib/errors.js"
import { extractTree } from "../lib/completion/tree.js"
import { bashScript } from "../lib/completion/bash.js"
import { zshScript } from "../lib/completion/zsh.js"
import { fishScript } from "../lib/completion/fish.js"
import { powershellScript } from "../lib/completion/powershell.js"
import { emit } from "../lib/ui.js"

/**
 * `helpbase completion <shell>` — emit a shell completion script to stdout.
 *
 * Scripts are generated at runtime from the Commander tree, so any new
 * subcommand or flag is completable the moment it ships, without updating
 * a hand-maintained completion file. See lib/completion/ for the shell-
 * specific generators.
 *
 * Static completion only: subcommand names + flag names. Dynamic values
 * (article paths, tenant slugs) are intentionally deferred — the ROI on
 * static is 90% of the win at 20% of the complexity.
 */

const SUPPORTED_SHELLS = ["bash", "zsh", "fish", "powershell"] as const
type Shell = (typeof SUPPORTED_SHELLS)[number]

export const completionCommand = new Command("completion")
  .description("Print a shell completion script")
  .argument("<shell>", `Target shell: ${SUPPORTED_SHELLS.join(", ")}`)
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase completion zsh > ~/.zsh/completions/_helpbase
  $ eval "$(helpbase completion bash)"
  $ helpbase completion fish > ~/.config/fish/completions/helpbase.fish
  $ helpbase completion powershell | Out-String | Invoke-Expression
`,
  )
  .action((shell: string) => {
    if (!SUPPORTED_SHELLS.includes(shell as Shell)) {
      throw new HelpbaseError({
        code: "E_MISSING_FLAG",
        problem: `Unsupported shell: ${shell}`,
        cause: `helpbase completion only knows about ${SUPPORTED_SHELLS.join(", ")}.`,
        fix: `Run one of: ${SUPPORTED_SHELLS.map((s) => `\`helpbase completion ${s}\``).join(", ")}`,
      })
    }

    // Program is the parent of this subcommand.
    const parent = completionCommand.parent
    if (!parent) {
      throw new HelpbaseError({
        code: "E_MISSING_FLAG",
        problem: "Could not locate the top-level command tree",
        fix: "This is an internal bug — please report at https://helpbase.dev",
      })
    }

    const tree = extractTree(parent)
    const script = generateScript(tree, shell as Shell)
    // Completion scripts are composable output meant for `eval` or file
    // redirect, so they go to stdout (not decorated, never suppressed).
    emit(script.trimEnd())
  })

function generateScript(
  tree: ReturnType<typeof extractTree>,
  shell: Shell,
): string {
  switch (shell) {
    case "bash":
      return bashScript(tree)
    case "zsh":
      return zshScript(tree)
    case "fish":
      return fishScript(tree)
    case "powershell":
      return powershellScript(tree)
  }
}
