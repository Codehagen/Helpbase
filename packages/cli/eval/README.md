# helpbase ingest — eval harness

Quantitative ship-block for `helpbase ingest`. An aggregate score ≥ 0.70 is the bar.

## Usage

```bash
pnpm --filter helpbase build
AI_GATEWAY_API_KEY=... pnpm --filter helpbase eval
```

The runner writes `packages/cli/eval/eval-report.json` and exits 0 on pass, 1 on fail.

## What it does

1. For each repo in `questions.ts`, runs `helpbase ingest <repo>` to generate `.helpbase/docs`.
2. For each question, runs `helpbase ingest <repo> --ask <question>` to collect an in-terminal answer.
3. Passes each (question, rubric, answer) to `grader.ts` — an LLM-as-judge that returns `{ score, citationCorrect, reasoning }`.
4. Aggregates per-repo + overall scores. Overall is the mean across repos.

## v1 scope

Evaluates the helpbase repo itself (5 questions). A failing score here is a hard ship-block.

## v1.1 (planned)

- External repos: shadcn-ui/ui + one other
- GitHub Actions `workflow_dispatch` + nightly cron
- Score history stored in `~/.gstack/analytics/eval.jsonl`

## Hosted-parity check

`run-hosted-parity.mjs` is a separate, structural gate (not LLM-graded). It
runs the same MCP tool calls through the stdio `@helpbase/mcp` binary and
through the hosted `/{slug}/mcp` endpoint and asserts the outputs match.
Threshold: hosted ≥ stdio × 0.95. Ship-block for the hosted bridge.

```bash
HOSTED_MCP_URL=https://{slug}.helpbase.dev/mcp \
HOSTED_MCP_TOKEN=... \
HOSTED_CONTENT_DIR=/path/to/same/content \
  pnpm eval:hosted-parity
```

Writes `hosted-parity-report.json`. Skips gracefully when any env is unset.

## Updating the question set

Edit `questions.ts`. Each question needs:

- `id` — a stable slug
- `question` — what you'd actually ask the agent
- `expectedCitations` — files the answer should reference
- `rubric` — the grader's yardstick

Keep the set tight — 5 well-targeted questions beat 25 generic ones.

## Cost

~30 LLM calls per run (one `--ask` + one judge call per question, × N questions × N repos). At default model (Gemini Flash Lite) this is fractions of a cent. Still non-zero — don't gate every PR on eval.

## Gotchas

- Requires `AI_GATEWAY_API_KEY`. Direct Anthropic/OpenAI SDKs ship in v1.1.
- The CLI writes `.helpbase/` into whatever repo you point it at. Running eval on the helpbase repo itself modifies `.helpbase/docs/` locally — commit your work first or `git stash`.
- The grader LLM can disagree with itself across runs. Expect ±0.05 variance on the aggregate score.
