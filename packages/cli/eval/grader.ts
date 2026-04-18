/**
 * LLM-as-judge grader for eval.
 *
 * Takes a question + rubric + the answer produced by `helpbase ingest --ask`,
 * returns a numeric score (0–1) and structured reasoning. The grading
 * prompt is fixed so runs are reproducible across sessions.
 *
 * v1 uses generateObject with a tight schema so we don't have to parse
 * free-form LLM output.
 */

import { generateObject } from "ai"
import { z } from "zod"

import { resolveModel, DEFAULT_MODEL } from "@workspace/shared/ai"

const judgeSchema = z.object({
  score: z.number().min(0).max(1),
  citationCorrect: z.boolean(),
  reasoning: z.string().min(1),
})

export type JudgeResult = z.infer<typeof judgeSchema>

export interface GradeInput {
  question: string
  rubric: string
  expectedCitations: string[]
  answer: string
  /** Override model. Defaults to the project default. */
  model?: string
}

export async function gradeAnswer(input: GradeInput): Promise<JudgeResult> {
  const model = input.model ?? resolveModel({})
  void DEFAULT_MODEL // keep the reference so a future smoke-test import doesn't re-import

  const prompt = buildJudgePrompt(input)
  const { object } = await generateObject({
    model,
    schema: judgeSchema,
    prompt,
  })
  return object
}

function buildJudgePrompt(input: GradeInput): string {
  const citations =
    input.expectedCitations.length > 0
      ? input.expectedCitations.map((c) => `- ${c}`).join("\n")
      : "(none required)"
  return `You are grading an AI-generated help-center answer against a rubric.

QUESTION:
${input.question}

RUBRIC:
${input.rubric}

EXPECTED CITATION PATHS (answer should mention at least one):
${citations}

ANSWER TO GRADE:
<answer>
${input.answer}
</answer>

Score this on a 0.0–1.0 scale where:
  1.0  — correct + cited the expected file(s) + matches rubric fully
  0.7  — mostly correct with a minor gap; acceptable quality
  0.5  — partially correct but missing a key piece
  0.2  — wrong or hallucinated, but has some correct structure
  0.0  — no useful signal

Return:
  score              — your numeric score
  citationCorrect    — true iff the answer mentions at least one of the
                       expected citation paths
  reasoning          — one-paragraph explanation of the score

Be strict. Don't reward fluency; reward correctness against the rubric.
`
}
