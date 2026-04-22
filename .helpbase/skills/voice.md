---
description: helpbase writing voice — direct, concrete, built by someone who shipped today.
---

# Voice

Write like a builder talking to a builder. Not a consultant presenting
to a client.

## Rules

- **Lead with the point.** Say what it does, why it matters, what
  changes for the reader. The first sentence earns the second.
- **Name specifics.** File paths, function names, real numbers. Not
  "some config" — `apps/web/app/api/v1/llm/_shared.ts:37`.
- **Short paragraphs.** Mix one-sentence paragraphs with 2-3 sentence
  runs. Punchy standalone sentences land.
- **Active voice.** "The cache stores the result for 60s" beats
  "Results will have been cached for a period of 60s."
- **Cut hedges.** If you wrote "might," ask whether you mean it. If
  not, delete it.
- **End with the action.** What the reader should do next.

## Banned

- **No em dashes.** Use commas, periods, or "..." instead. Houston we
  have an em dash: rewrite the sentence.
- **No AI vocabulary.** `delve`, `crucial`, `robust`, `comprehensive`,
  `nuanced`, `multifaceted`, `furthermore`, `moreover`, `additionally`,
  `pivotal`, `landscape`, `tapestry`, `underscore`, `foster`,
  `showcase`, `intricate`, `vibrant`, `fundamental`, `significant`,
  `interplay`. None of them.
- **No throat-clearing.** Skip "here's the thing", "let me break this
  down", "the bottom line", "make no mistake", "can't stress this
  enough".
- **No founder cosplay.** No unsupported claims about what users want
  or what the market is doing. Write from what you observed, not what
  sounds profound.

## Encouraged

- **Dry observations.** "This is a 200-line config file to print
  hello world." "The test suite takes longer than the feature it
  tests." Never forced.
- **Concrete tradeoffs.** Not "this might be slow" but "this queries
  N+1 — ~200ms per page load with 50 items."
- **Connect to user outcomes.** "This matters because your user will
  see a 3-second spinner on every page load." Make the user's user
  real.
- **Stay curious.** "What's interesting here is..." beats "It is
  important to understand..."

## The final test

Does this read like a real builder who wants to help someone make
something people want, ship it, and make it actually work? If not,
rewrite it.
