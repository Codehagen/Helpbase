import fs from "node:fs"
import path from "node:path"
import type { Doc } from "./loader.js"
import type { SearchHit } from "./index.js"

/**
 * Semantic search primitives for helpbase-mcp.
 *
 * The default embedder dynamically imports `@xenova/transformers` so the
 * dependency stays optional — users who only want keyword search never pay
 * the install or cold-start cost. Tests and advanced users can inject their
 * own Embedder to avoid the model download entirely.
 *
 * Index format is plain JSON (not .bin) so it stays human-diffable and
 * trivially portable between Node versions. If corpus size grows to the
 * point where JSON is the bottleneck, upgrade the codec and bump `version`.
 */

export const DEFAULT_SEMANTIC_MODEL = "Xenova/all-MiniLM-L6-v2"

/** Environment variable that lets operators point at a prebuilt index. */
export const SEARCH_INDEX_ENV = "HELPBASE_SEARCH_INDEX"

/** Filename we look for beside the content dir when the env var is unset. */
export const DEFAULT_SEARCH_INDEX_FILENAME = ".search-index.json"

export interface SearchIndexEntry {
  /** `${doc.category}/${doc.slug}` — the same shape get_doc accepts. */
  key: string
  vector: number[]
}

export interface SearchIndex {
  version: 1
  model: string
  dim: number
  entries: SearchIndexEntry[]
}

export type Embedder = (texts: string[]) => Promise<number[][]>

/**
 * Concatenates title, description, and body into a single text blob for
 * embedding. Capped so one huge doc can't dominate the embedder's context
 * window — MiniLM truncates to 256 tokens anyway, but keeping prose cheap
 * also matters for the build step.
 */
export function docSearchText(doc: Doc): string {
  const parts: string[] = []
  if (doc.title) parts.push(doc.title)
  if (doc.description) parts.push(doc.description)
  if (doc.content) parts.push(doc.content)
  return parts.join("\n\n").slice(0, 8000)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    dot += ai * bi
    normA += ai * ai
    normB += bi * bi
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

let cachedDefaultEmbedder: { model: string; embedder: Embedder } | null = null

/**
 * Loads the default Transformers.js embedder. Kept lazy so the cost only
 * lands when semantic search actually runs, and cached per-model so a warm
 * process doesn't re-download or re-initialize the pipeline on every query.
 *
 * If `@xenova/transformers` is not installed, throws with an install hint.
 */
async function loadDefaultEmbedder(model: string): Promise<Embedder> {
  if (cachedDefaultEmbedder && cachedDefaultEmbedder.model === model) {
    return cachedDefaultEmbedder.embedder
  }

  type TransformersModule = {
    pipeline: (...args: unknown[]) => Promise<unknown>
  }
  let mod: TransformersModule
  try {
    // Assemble the specifier at runtime so the TS compiler doesn't try to
    // resolve it — the dep is an optional peer, not bundled with this
    // package. If the user hasn't installed it, we throw a clear hint below.
    const specifier = "@xenova/" + "transformers"
    mod = (await import(/* @vite-ignore */ specifier)) as TransformersModule
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Semantic search requires the optional @xenova/transformers peer ` +
        `dependency. Install it with: npm install @xenova/transformers ` +
        `(underlying error: ${msg})`,
    )
  }

  const extractor = (await mod.pipeline("feature-extraction", model, {
    quantized: true,
  })) as (
    text: string,
    opts?: { pooling?: "mean" | "cls"; normalize?: boolean },
  ) => Promise<{ data: Float32Array }>

  const embedder: Embedder = async (texts) => {
    const out: number[][] = []
    for (const text of texts) {
      const result = await extractor(text, { pooling: "mean", normalize: true })
      out.push(Array.from(result.data))
    }
    return out
  }

  cachedDefaultEmbedder = { model, embedder }
  return embedder
}

export interface BuildIndexOptions {
  model?: string
  /** Inject a custom embedder — used by tests and by power users. */
  embedder?: Embedder
}

export async function buildSearchIndex(
  docs: Doc[],
  options: BuildIndexOptions = {},
): Promise<SearchIndex> {
  const model = options.model ?? DEFAULT_SEMANTIC_MODEL
  const embedder = options.embedder ?? (await loadDefaultEmbedder(model))
  if (docs.length === 0) {
    return { version: 1, model, dim: 0, entries: [] }
  }
  const texts = docs.map(docSearchText)
  const vectors = await embedder(texts)
  if (vectors.length !== docs.length) {
    throw new Error(
      `Embedder returned ${vectors.length} vectors for ${docs.length} docs`,
    )
  }
  const dim = vectors[0]?.length ?? 0
  const entries: SearchIndexEntry[] = docs.map((doc, i) => ({
    key: `${doc.category}/${doc.slug}`,
    vector: vectors[i]!,
  }))
  return { version: 1, model, dim, entries }
}

export function saveSearchIndex(index: SearchIndex, filePath: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(index))
}

/**
 * Load and validate a search index from disk. Returns null for any failure
 * (missing, unreadable, malformed, wrong version, inconsistent dim). The
 * caller is expected to fall back to keyword search rather than surface a
 * hard error — a broken index should never take down the MCP server.
 */
export function loadSearchIndex(filePath: string): SearchIndex | null {
  if (!fs.existsSync(filePath)) return null
  let raw: string
  try {
    raw = fs.readFileSync(filePath, "utf-8")
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isValidIndex(parsed)) return null
  return parsed
}

function isValidIndex(value: unknown): value is SearchIndex {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v["version"] !== 1) return false
  if (typeof v["model"] !== "string") return false
  if (typeof v["dim"] !== "number") return false
  if (!Array.isArray(v["entries"])) return false
  for (const entry of v["entries"]) {
    if (!entry || typeof entry !== "object") return false
    const e = entry as Record<string, unknown>
    if (typeof e["key"] !== "string") return false
    if (!Array.isArray(e["vector"])) return false
    if (v["dim"] !== 0 && (e["vector"] as unknown[]).length !== v["dim"]) {
      return false
    }
    for (const n of e["vector"] as unknown[]) {
      if (typeof n !== "number" || !Number.isFinite(n)) return false
    }
  }
  return true
}

export interface SemanticSearchOptions {
  embedder?: Embedder
}

/**
 * Score every indexed doc against the query vector, sort descending. Docs
 * present in the content dir but missing from the index (e.g. added after
 * the index was built) are silently skipped here — a stale-index warning
 * belongs at the server-startup layer, not on every search.
 */
export async function semanticSearch(
  docs: Doc[],
  query: string,
  index: SearchIndex,
  options: SemanticSearchOptions = {},
): Promise<SearchHit[]> {
  if (index.entries.length === 0) return []
  const embedder =
    options.embedder ?? (await loadDefaultEmbedder(index.model))
  const [queryVec] = await embedder([query])
  if (!queryVec) return []

  const docByKey = new Map<string, Doc>()
  for (const doc of docs) {
    docByKey.set(`${doc.category}/${doc.slug}`, doc)
  }

  const hits: SearchHit[] = []
  for (const entry of index.entries) {
    const doc = docByKey.get(entry.key)
    if (!doc) continue
    const score = cosineSimilarity(queryVec, entry.vector)
    if (score > 0) hits.push({ doc, score })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits
}

/**
 * Resolve the index path to try at server startup. Explicit env var wins;
 * otherwise we look for a sibling file next to the content dir. Returning a
 * string doesn't imply the file exists — the loader handles missing gracefully.
 */
export function resolveDefaultIndexPath(contentDir: string): string {
  const envPath = process.env[SEARCH_INDEX_ENV]
  if (envPath && envPath.length > 0) {
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath)
  }
  return path.join(path.dirname(contentDir), DEFAULT_SEARCH_INDEX_FILENAME)
}
