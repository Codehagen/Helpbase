import { describe, expect, it } from "vitest"
import {
  syncCitationSchema,
  syncProposalSchema,
  syncProposalsSchema,
} from "@workspace/shared/schemas"

/**
 * Anti-hallucination invariant: the sync pipeline must never accept an LLM
 * proposal that lacks citations into the source code. If this test ever
 * fails, the schema was relaxed and the whole sync UX trust model breaks.
 *
 * The property test below is the 100-mutation fuzzer that the plan locks in
 * as the gate for the `helpbase sync` command merge.
 */

function validProposal() {
  return {
    file: "docs/guides/auth.mdx",
    before: "Use the old auth endpoint.",
    after: "Use the new OAuth endpoint.",
    citations: [
      { sourceFile: "src/auth/handler.ts", lineStart: 12, lineEnd: 34 },
    ],
    rationale: "Endpoint renamed in commit abc123",
  }
}

describe("syncCitationSchema", () => {
  it("accepts a citation with lineEnd === lineStart", () => {
    expect(() =>
      syncCitationSchema.parse({
        sourceFile: "a.ts",
        lineStart: 1,
        lineEnd: 1,
      }),
    ).not.toThrow()
  })

  it("rejects a citation where lineEnd < lineStart", () => {
    expect(() =>
      syncCitationSchema.parse({
        sourceFile: "a.ts",
        lineStart: 10,
        lineEnd: 5,
      }),
    ).toThrow(/lineEnd must be >= lineStart/)
  })

  it.each([0, -1, -999, 0.5])(
    "rejects non-positive or non-integer line numbers (%s)",
    (bad) => {
      expect(() =>
        syncCitationSchema.parse({
          sourceFile: "a.ts",
          lineStart: bad,
          lineEnd: bad,
        }),
      ).toThrow()
    },
  )

  it("rejects empty sourceFile", () => {
    expect(() =>
      syncCitationSchema.parse({
        sourceFile: "",
        lineStart: 1,
        lineEnd: 1,
      }),
    ).toThrow(/sourceFile is required/)
  })
})

describe("syncProposalSchema", () => {
  it("accepts a well-formed proposal", () => {
    expect(() => syncProposalSchema.parse(validProposal())).not.toThrow()
  })

  it("rejects a proposal with zero citations", () => {
    const bad = { ...validProposal(), citations: [] }
    expect(() => syncProposalSchema.parse(bad)).toThrow(
      /at least one citation is required/,
    )
  })

  it("rejects a proposal missing citations entirely", () => {
    const bad = validProposal() as Record<string, unknown>
    delete bad.citations
    expect(() => syncProposalSchema.parse(bad)).toThrow()
  })

  it("rejects a proposal with empty file path", () => {
    const bad = { ...validProposal(), file: "" }
    expect(() => syncProposalSchema.parse(bad)).toThrow(/file path is required/)
  })
})

describe("syncProposalSchema — 100-mutation property test (anti-hallucination gate)", () => {
  /**
   * Deterministic PRNG so the test is reproducible across machines.
   * mulberry32 — adequate for fuzzing schema validation.
   */
  function rng(seed: number) {
    let t = seed
    return () => {
      t += 0x6d2b79f5
      let r = Math.imul(t ^ (t >>> 15), 1 | t)
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
  }

  const NUM_MUTATIONS = 100

  it(`rejects all ${NUM_MUTATIONS} mutated zero-citation payloads`, () => {
    const random = rng(0xbadf00d)
    const pick = <T>(arr: readonly T[]): T =>
      arr[Math.floor(random() * arr.length)]!

    const filePool = [
      "docs/a.mdx",
      "docs/b/c.mdx",
      "content/getting-started/intro.mdx",
      "long/nested/path/to/some/doc.mdx",
      "doc with spaces.mdx",
    ]
    const bodyPool = [
      "",
      "some content",
      "line1\nline2\nline3",
      "content with `code` and **bold**",
      "x".repeat(500),
    ]

    let rejected = 0
    for (let i = 0; i < NUM_MUTATIONS; i++) {
      // Every mutation still has zero citations — that's the invariant under test.
      const mutation: Record<string, unknown> = {
        file: pick(filePool),
        before: pick(bodyPool),
        after: pick(bodyPool),
        citations: [],
      }

      // Randomly include or omit optional rationale.
      if (random() < 0.5) mutation.rationale = "auto-generated rationale"

      // Randomly attach extraneous fields to simulate model output drift.
      if (random() < 0.3) mutation.extra = "noise"
      if (random() < 0.2) mutation.timestamp = Date.now()

      const result = syncProposalSchema.safeParse(mutation)
      if (!result.success) {
        rejected++
      } else {
        throw new Error(
          `Mutation #${i} with zero citations unexpectedly passed: ${JSON.stringify(mutation)}`,
        )
      }
    }

    expect(rejected).toBe(NUM_MUTATIONS)
  })

  it(`rejects ${NUM_MUTATIONS} mutations that drop/corrupt the citations field`, () => {
    const random = rng(0xfeedface)

    const corruptors: Array<(obj: Record<string, unknown>) => void> = [
      (o) => delete o.citations,
      (o) => (o.citations = null),
      (o) => (o.citations = undefined),
      (o) => (o.citations = "not an array"),
      (o) => (o.citations = 42),
      (o) => (o.citations = {}),
      (o) => (o.citations = [{}]), // citation missing required fields
      (o) => (o.citations = [{ sourceFile: "a.ts", lineStart: 0, lineEnd: 0 }]),
      (o) => (o.citations = [{ sourceFile: "a.ts", lineStart: 5, lineEnd: 1 }]),
      (o) => (o.citations = [{ lineStart: 1, lineEnd: 1 }]),
      (o) => (o.citations = [{ sourceFile: "", lineStart: 1, lineEnd: 1 }]),
    ]

    let rejected = 0
    for (let i = 0; i < NUM_MUTATIONS; i++) {
      const mutation = {
        ...validProposal(),
      } as Record<string, unknown>
      const corrupt = corruptors[Math.floor(random() * corruptors.length)]!
      corrupt(mutation)

      const result = syncProposalSchema.safeParse(mutation)
      if (!result.success) {
        rejected++
      } else {
        throw new Error(
          `Mutation #${i} unexpectedly passed: ${JSON.stringify(mutation)}`,
        )
      }
    }
    expect(rejected).toBe(NUM_MUTATIONS)
  })
})

describe("syncProposalsSchema", () => {
  it("accepts an empty proposals array (nothing to sync)", () => {
    expect(() => syncProposalsSchema.parse({ proposals: [] })).not.toThrow()
  })

  it("filters mixed valid/invalid via safeParse per item (invariant doc)", () => {
    // The top-level schema is strict — a single bad proposal fails the whole
    // object. This documents that invariant; sync.ts is responsible for
    // partitioning valid vs rejected proposals before passing to the schema.
    const result = syncProposalsSchema.safeParse({
      proposals: [validProposal(), { file: "bad.mdx", before: "", after: "", citations: [] }],
    })
    expect(result.success).toBe(false)
  })
})
