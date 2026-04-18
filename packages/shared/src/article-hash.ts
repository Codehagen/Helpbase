import { createHash } from "node:crypto"

/**
 * Deterministic content hash for a deployed article. Drives the preview
 * diff between local `content/` and the hosted tenant, so the algorithm
 * MUST produce byte-identical output on the client (during `helpbase
 * deploy --preview`) and the server (stored in `tenant_articles.content_hash`
 * when `deploy_tenant` writes a row).
 *
 * Canonical serialization:
 *   title + "\n" + description + "\n" + stableStringify(frontmatter) + "\n" + content
 *
 * No whitespace normalization. MDX carries meaningful whitespace — code
 * blocks, JSX text, fenced content, preformatted examples — so normalizing
 * would hide real edits and produce "unchanged" false positives on the
 * preview. Hash exactly what's stored.
 *
 * Frontmatter keys are sorted at every object level so
 * `{ title: "X", order: 1 }` and `{ order: 1, title: "X" }` hash the
 * same. Array order is preserved (it's semantic: tags, citations).
 *
 * Hash parity is validated by packages/shared/test/article-hash.test.ts
 * via snapshot fixtures, which fail loudly if the algorithm drifts.
 */
export interface ArticleHashInput {
  title: string
  description: string
  frontmatter: Record<string, unknown>
  content: string
}

const SEPARATOR = "\n"

export function hashArticle(input: ArticleHashInput): string {
  const payload = [
    input.title,
    input.description,
    stableStringify(input.frontmatter),
    input.content,
  ].join(SEPARATOR)
  return createHash("sha256").update(payload, "utf8").digest("hex")
}

/**
 * JSON.stringify with recursively sorted object keys. Ensures that two
 * semantically-equal objects produce the same string regardless of how
 * their keys were inserted. Arrays keep their order.
 *
 * Exported so tests (and future server code) can snapshot-verify the
 * canonical form without hashing.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value ?? null)
  if (typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]"
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") +
    "}"
  )
}
