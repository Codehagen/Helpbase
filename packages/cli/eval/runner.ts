/**
 * Eval runner for `helpbase context`.
 *
 * Per repo:
 *   1. Run `helpbase context <repo>` to generate .helpbase/docs.
 *   2. For each question, run `helpbase context <repo> --ask <q>` to
 *      get the in-terminal answer.
 *   3. Grade each answer with grader.ts (LLM-as-judge).
 *   4. Aggregate per-repo + overall scores. Compare to EVAL_PASS_THRESHOLD.
 *
 * Usage:
 *
 *   AI_GATEWAY_API_KEY=... pnpm --filter helpbase eval
 *
 * v1 evaluates the helpbase repo itself. v1.1 adds external repos and
 * CI workflow_dispatch gating.
 */

import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { gradeAnswer, type JudgeResult } from "./grader.js"
import {
  EVAL_REPOS,
  EVAL_PASS_THRESHOLD,
  type EvalRepo,
  type EvalQuestion,
} from "./questions.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLI_PATH = path.resolve(__dirname, "../dist/index.js")
/** Monorepo root — `packages/cli/eval` → repo root. Relative repo paths in
 *  questions.ts resolve from here, not from the runner's CWD. */
const MONOREPO_ROOT = path.resolve(__dirname, "../../..")
/** Budget for the eval runs. The helpbase self-dogfood has ~350k tokens
 *  across 322 source files; 500k gives headroom for external repos too. */
const EVAL_MAX_TOKENS = 500_000
/** Model used for generation and --ask during eval. Sonnet is the quality
 *  gate — the eval measures "can the pipeline produce docs good enough
 *  that agents answer correctly", not "does the cheapest model work".
 *  Override with HELPBASE_EVAL_MODEL=... for local cost-sensitive runs. */
const EVAL_MODEL =
  process.env.HELPBASE_EVAL_MODEL ?? "anthropic/claude-sonnet-4.6"

interface QuestionResult {
  questionId: string
  answer: string
  grade: JudgeResult
  durationMs: number
}

interface RepoResult {
  repoId: string
  label: string
  averageScore: number
  citationAccuracy: number
  questionResults: QuestionResult[]
}

interface RunReport {
  overallScore: number
  threshold: number
  passed: boolean
  reposRun: number
  repos: RepoResult[]
  startedAt: string
  durationMs: number
}

async function main(): Promise<void> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error("✖ AI_GATEWAY_API_KEY is not set — eval requires a real LLM key.")
    console.error("  export AI_GATEWAY_API_KEY=... then retry.")
    process.exit(1)
  }
  if (!fs.existsSync(CLI_PATH)) {
    console.error(`✖ CLI not built at ${CLI_PATH}. Run: pnpm --filter helpbase build`)
    process.exit(1)
  }

  const startedAt = Date.now()
  const repoResults: RepoResult[] = []

  for (const repo of EVAL_REPOS) {
    console.log(`\n▶ Evaluating ${repo.label} (${repo.path})`)
    const result = await runRepoEval(repo)
    repoResults.push(result)
    console.log(
      `  ${repo.id}: avg ${result.averageScore.toFixed(2)}, ` +
        `citation ${(result.citationAccuracy * 100).toFixed(0)}%`,
    )
  }

  const overall =
    repoResults.reduce((acc, r) => acc + r.averageScore, 0) /
    Math.max(1, repoResults.length)

  const report: RunReport = {
    overallScore: overall,
    threshold: EVAL_PASS_THRESHOLD,
    passed: overall >= EVAL_PASS_THRESHOLD,
    reposRun: repoResults.length,
    repos: repoResults,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
  }

  const out = path.resolve(__dirname, "eval-report.json")
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`\nReport: ${out}`)
  console.log(
    `Overall: ${(overall * 100).toFixed(1)}% — ${report.passed ? "PASS" : "FAIL"} (threshold ${(EVAL_PASS_THRESHOLD * 100).toFixed(0)}%)`,
  )
  process.exit(report.passed ? 0 : 1)
}

async function runRepoEval(repo: EvalRepo): Promise<RepoResult> {
  const repoAbs = path.isAbsolute(repo.path)
    ? repo.path
    : path.resolve(MONOREPO_ROOT, repo.path)
  if (!fs.existsSync(repoAbs)) {
    throw new Error(`Repo path does not exist: ${repoAbs}`)
  }

  // Generate docs once per repo — individual --ask calls re-use them.
  console.log(`  › helpbase context ${repoAbs} (model: ${EVAL_MODEL})`)
  execSync(
    `node ${CLI_PATH} context ${repoAbs} --max-tokens ${EVAL_MAX_TOKENS} --model ${EVAL_MODEL} --yes`,
    { stdio: "inherit", env: process.env },
  )

  const questionResults: QuestionResult[] = []
  for (const q of repo.questions) {
    const { answer, durationMs } = runAsk(repoAbs, q)
    const grade = await gradeAnswer({
      question: q.question,
      rubric: q.rubric,
      expectedCitations: q.expectedCitations,
      answer,
    })
    console.log(
      `    [${q.id}] ${grade.score.toFixed(2)} ${grade.citationCorrect ? "✓cite" : "✗cite"} (${durationMs}ms)`,
    )
    questionResults.push({ questionId: q.id, answer, grade, durationMs })
  }

  const avg =
    questionResults.reduce((acc, r) => acc + r.grade.score, 0) /
    Math.max(1, questionResults.length)
  const citationAcc =
    questionResults.filter((r) => r.grade.citationCorrect).length /
    Math.max(1, questionResults.length)

  return {
    repoId: repo.id,
    label: repo.label,
    averageScore: avg,
    citationAccuracy: citationAcc,
    questionResults,
  }
}

function runAsk(
  repoAbs: string,
  q: EvalQuestion,
): { answer: string; durationMs: number } {
  const started = Date.now()
  // Shell-quote the question string.
  const qArg = JSON.stringify(q.question)
  const out = execSync(
    `node ${CLI_PATH} context ${repoAbs} --ask ${qArg} --max-tokens ${EVAL_MAX_TOKENS} --model ${EVAL_MODEL} --yes`,
    { encoding: "utf8", env: process.env },
  )
  return { answer: out, durationMs: Date.now() - started }
}

main().catch((err) => {
  console.error("\n✖ Eval run failed:")
  console.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(1)
})
