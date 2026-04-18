/**
 * Eval question set for `helpbase ingest`.
 *
 * v1 scope: the helpbase repo itself. Each question has an expected
 * citation target (a path the correct doc should reference) and a
 * rubric the LLM judge evaluates against.
 *
 * v1.1 will add 2 external repos (shadcn-ui/ui + 1 other) + CI
 * workflow_dispatch. For v1 the harness proves the thesis on one
 * real codebase — that's the ≥70% ship-block in the plan.
 */

export interface EvalQuestion {
  id: string
  question: string
  /** File paths the correct answer should cite (at least one). */
  expectedCitations: string[]
  /** Rubric the grader uses when judging the generated answer. */
  rubric: string
}

export interface EvalRepo {
  id: string
  label: string
  /** Absolute or relative path to the repo on disk. */
  path: string
  questions: EvalQuestion[]
}

export const HELPBASE_SELF_REPO: EvalRepo = {
  id: "helpbase-self",
  label: "helpbase (self-dogfood)",
  path: ".",
  questions: [
    {
      id: "mcp-content-dir",
      question:
        "How does the MCP server discover which directory to read docs from?",
      expectedCitations: ["packages/mcp/src/content/loader.ts"],
      rubric:
        "Correct answer mentions HELPBASE_CONTENT_DIR env var + the fallback order (apps/web/content/ in monorepo, then ./content/ flat). Must cite loader.ts.",
    },
    {
      id: "generate-repo-flag",
      question: "How do I use the CLI to generate articles from a local repo?",
      expectedCitations: ["packages/cli/src/commands/generate.ts"],
      rubric:
        "Correct answer explains the `helpbase generate --repo <path>` command (or positional alias), the 200k char cap, and the output going to the --output directory. Must cite generate.ts.",
    },
    {
      id: "context-citation-validator",
      question:
        "What happens when a generated doc's citations can't be validated against the repo?",
      expectedCitations: [
        "packages/shared/src/citations.ts",
        "packages/cli/src/commands/context.ts",
      ],
      rubric:
        "Correct answer explains: per-citation literal-text validation, drops the citation if invalid, drops the doc if no citations remain, logs to synthesis-report.json. Must cite at least one of the two files.",
    },
    {
      id: "secret-deny-list",
      question: "What files does the secret deny-list block from the LLM context?",
      expectedCitations: ["packages/shared/src/secrets.ts"],
      rubric:
        "Correct answer names at least 3 patterns (e.g. .env, *.pem, *.key, sk-, AKIA..., private key PEM). Must cite secrets.ts.",
    },
    {
      id: "mcp-shadcn-install",
      question: "How do I install the helpbase MCP server into an existing shadcn project?",
      expectedCitations: [
        "registry/helpbase-mcp",
        "apps/web/public/r/helpbase-mcp.json",
      ],
      rubric:
        "Correct answer shows the `npx shadcn@latest add https://helpbase.dev/r/helpbase-mcp.json` command AND explains it drops source files into the project (not just a binary dep). Cite either the registry source or the built JSON.",
    },
  ],
}

/** All repos included in the v1 eval run. */
export const EVAL_REPOS: EvalRepo[] = [HELPBASE_SELF_REPO]

/** Ship-block threshold. Aggregate score below this fails the run. */
export const EVAL_PASS_THRESHOLD = 0.7
