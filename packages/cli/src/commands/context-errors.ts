/**
 * Error catalog for `helpbase context`.
 *
 * Every error path surfaces the same {problem, cause, fix} shape so the
 * user always knows what happened and what to do next. This is the
 * DX-review-mandated error formatting — half the error paths in the
 * pre-review draft had no specified UX. Now they all do.
 *
 * Thin layer over HelpbaseError — the doc URL is derived automatically
 * from the `code` (see errors.ts `docUrl()`).
 */

import { HelpbaseError, type ErrorCode } from "../lib/errors.js"

export type ContextErrorCode = Extract<ErrorCode, `E_CONTEXT_${string}`>

interface ContextErrorBase {
  problem: string
  cause: string
  fix: string | string[]
}

export const CONTEXT_ERRORS: Record<ContextErrorCode, ContextErrorBase> = {
  E_CONTEXT_MISSING_KEY: {
    problem: "No LLM API key is set in your environment.",
    cause:
      "helpbase context accepts any one of: AI_GATEWAY_API_KEY (any provider), " +
      "ANTHROPIC_API_KEY (--model anthropic/...), or OPENAI_API_KEY (--model openai/...). " +
      "Set the one you already have.",
    fix: [
      "If you have an Anthropic key: export ANTHROPIC_API_KEY=sk-ant-... and re-run with --model anthropic/claude-3-5-sonnet-latest.",
      "If you have an OpenAI key: export OPENAI_API_KEY=sk-... and re-run with --model openai/gpt-4o-mini.",
      "Or sign up for Vercel AI Gateway (free, routes any provider): https://vercel.com/ai-gateway — export AI_GATEWAY_API_KEY=<gateway-key>.",
    ],
  },
  E_CONTEXT_NO_SOURCES: {
    problem: "No source files found in the target repo.",
    cause:
      "helpbase context walks markdown + selected code extensions and skips " +
      "secret files, lockfile dirs, build output, and .gitignore-style paths. " +
      "Either the directory is empty or everything got filtered out.",
    fix: [
      "Check the path you passed — `helpbase context .` uses the current directory.",
      "Add a README.md or source files with supported extensions (.md, .mdx, .ts, .tsx, .js, .py, .go, .rs, .rb, .java).",
    ],
  },
  E_CONTEXT_OVER_BUDGET: {
    problem: "The repo's source content exceeds the token budget.",
    cause:
      "Default budget is 100,000 input tokens estimated at 3.5 chars/token. " +
      "Your repo is above that.",
    fix: [
      "Raise the ceiling: --max-tokens 200000.",
      "Narrow scope: --only <category>.",
      "Adjust the ratio for your content type: --chars-per-token 4.2 (prose-heavy) / 2.8 (code-heavy).",
    ],
  },
  E_CONTEXT_DIRTY_TREE: {
    problem: "Working tree has uncommitted changes and --require-clean was set.",
    cause:
      "--require-clean is CI-mode. It fails fast if git status shows modifications " +
      "so scheduled runs don't commingle generated docs with WIP code.",
    fix: [
      "Commit or `git stash` your WIP, then re-run.",
      "Drop --require-clean if you're running locally (default warns but continues).",
    ],
  },
  E_CONTEXT_SCHEMA: {
    problem: "The model returned output that did not match the generation schema.",
    cause:
      "Some models emit empty arrays for nested `min(1)` constraints, or wrap JSON in prose. " +
      "We retried once with a smaller input slice and it still failed.",
    fix: [
      "Try a stronger model: --model anthropic/claude-sonnet-4.6.",
      "Reduce scope with --only <category> or --max-tokens <n>.",
    ],
  },
  E_CONTEXT_NO_VALID_CITATIONS: {
    problem: "Every generated doc failed citation validation — nothing was written.",
    cause:
      "The LLM emitted citations whose file + line range + snippet could not be " +
      "literally matched against the repo. Usually means the model hallucinated evidence.",
    fix: [
      "Check .helpbase/synthesis-report.json for per-citation drop reasons.",
      "If snippets were paraphrased, retry with --model anthropic/claude-sonnet-4.6.",
      "If cited code files were missing from the reader, use --include-ext to widen it.",
    ],
  },
  E_CONTEXT_SECRET: {
    problem: "Generated content matched a secret-shaped pattern. Run aborted.",
    cause:
      "The pre-write secret scanner caught content that looks like an API key, " +
      "private key, or credential. NOTHING was written to .helpbase/.",
    fix: [
      "Open the file + line shown above.",
      "If it's a legitimate example, use a placeholder (sk-xxxxx) instead of a realistic-looking value.",
      "If it's a real secret, rotate it immediately and add the source file to .gitignore.",
    ],
  },
  E_CONTEXT_REPO_PATH: {
    problem: "The repo path you passed does not exist or is not a directory.",
    cause: "helpbase context needs a local directory to walk.",
    fix: [
      "Check the path. Use `.` for the current directory. Absolute paths work too.",
    ],
  },
  E_CONTEXT_REUSE_WITHOUT_ASK: {
    problem: "--reuse-existing requires --ask — nothing to reuse without a question.",
    cause:
      "--reuse-existing skips the walk + LLM generation so an existing .helpbase/docs/ " +
      "can be queried with --ask. On its own it would do nothing.",
    fix: [
      "Pair with --ask: `helpbase context . --reuse-existing --ask \"...\"`.",
      "Or drop --reuse-existing to regenerate from scratch.",
    ],
  },
  E_CONTEXT_REUSE_EMPTY: {
    problem: "--reuse-existing was set but .helpbase/docs/ has no MDX files to reuse.",
    cause:
      "The output directory is empty. You need to have run `helpbase context` at " +
      "least once before --reuse-existing has anything to answer from.",
    fix: [
      "Run once without --reuse-existing to populate .helpbase/docs, then re-run with --reuse-existing.",
      "Check that --output points at the same directory your previous run used.",
    ],
  },
  E_CONTEXT_PREVIEW_NO_DOCS: {
    problem: "`helpbase preview` needs .helpbase/docs/ to exist in the current directory.",
    cause:
      "Preview renders the MDX `helpbase context` produces. There's nothing to render yet.",
    fix: [
      "Run `helpbase context .` first — that generates the docs.",
      "Then `helpbase preview` to open them in the browser.",
    ],
  },
  E_CONTEXT_PREVIEW_SCAFFOLD: {
    problem: "Failed to scaffold the preview renderer.",
    cause:
      "The first `helpbase preview` on a new CLI version shells out to " +
      "`npx create-helpbase` to set up a cached renderer. That command failed.",
    fix: [
      "Check your network — the first run needs to reach the npm registry.",
      "Retry: `helpbase preview --reset` wipes the cache and starts over.",
      "If it keeps failing: `npx create-helpbase@latest /tmp/test` in isolation.",
    ],
  },
  E_CONTEXT_PREVIEW_INSTALL: {
    problem: "Failed to install preview dependencies.",
    cause:
      "The scaffolded renderer's package manager install exited with an error.",
    fix: [
      "Check your network and disk space.",
      "Retry: `helpbase preview --reset` to re-scaffold + re-install.",
    ],
  },
}

export function contextError(
  code: ContextErrorCode,
  overrides?: Partial<ContextErrorBase>,
): HelpbaseError {
  const info = CONTEXT_ERRORS[code]
  return new HelpbaseError({
    code,
    problem: overrides?.problem ?? info.problem,
    cause: overrides?.cause ?? info.cause,
    fix: overrides?.fix ?? info.fix,
  })
}
