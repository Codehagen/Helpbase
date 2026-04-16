import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  findContentDir,
  loadCategories,
  loadDocs,
  type CategoryMeta,
  type Doc,
} from "./content/loader.js"
import {
  handleSearchDocs,
  searchDocsInput,
} from "./tools/search-docs.js"
import { getDocInput, handleGetDoc } from "./tools/get-doc.js"
import { handleListDocs, listDocsInput } from "./tools/list-docs.js"
import {
  loadSearchIndex,
  resolveDefaultIndexPath,
  type SearchIndex,
} from "./content/semantic.js"

export interface ServerDeps {
  contentDir: string
  docs: Doc[]
  categories: CategoryMeta[]
  /** Semantic index, if one was loaded at startup. Null = keyword fallback. */
  searchIndex: SearchIndex | null
  /** Absolute path we tried to load from (useful for tests + diagnostics). */
  searchIndexPath: string
}

export interface BuildServerOptions {
  name?: string
  version?: string
  /** Override the content dir. If omitted, resolves via findContentDir(). */
  contentDir?: string
  /**
   * Override the search-index path. If omitted, resolves via
   * HELPBASE_SEARCH_INDEX env or the default sibling file. Pass `null` to
   * force keyword-only mode regardless of env/defaults.
   */
  searchIndexPath?: string | null
}

/**
 * Build a fresh McpServer with three tools wired against a loaded content index.
 *
 * Transport-agnostic: this function does NOT connect a transport. Callers pick
 * stdio (entry point) or HTTP (v2) and connect themselves. Keeping transport
 * out of here is what makes adding HTTP in v2 a 1-file change.
 *
 * CRITICAL: never write to stdout from this file or anything it calls. Under
 * stdio transport, stdout carries the JSON-RPC stream and any stray write
 * corrupts it. Logs go to stderr via console.error (or a dedicated logger).
 */
export function buildServer(options: BuildServerOptions = {}): {
  server: McpServer
  deps: ServerDeps
} {
  const contentDir = options.contentDir ?? findContentDir()
  const docs = loadDocs(contentDir)
  const categories = loadCategories(contentDir)

  let searchIndex: SearchIndex | null = null
  let searchIndexPath = ""
  if (options.searchIndexPath !== null) {
    searchIndexPath =
      options.searchIndexPath ?? resolveDefaultIndexPath(contentDir)
    searchIndex = loadSearchIndex(searchIndexPath)
    if (searchIndex) {
      const stale = docs.filter(
        (d) =>
          !searchIndex!.entries.some(
            (e) => e.key === `${d.category}/${d.slug}`,
          ),
      )
      if (stale.length > 0) {
        process.stderr.write(
          `[helpbase-mcp] Search index is missing ${stale.length} doc(s) — ` +
            `rebuild with: helpbase-mcp-build-index\n`,
        )
      }
    }
  }

  const server = new McpServer({
    name: options.name ?? "helpbase-mcp",
    // Kept in sync with package.json by a test in test/package-bin.test.ts.
    // Update both together on every release.
    version: options.version ?? "0.1.1",
  })

  server.registerTool(
    "search_docs",
    {
      title: "Search docs",
      description: searchIndex
        ? "Search Helpbase docs using semantic embeddings. Returns a ranked list of matching doc slugs."
        : "Search Helpbase docs by keyword. Matches titles, descriptions, and body. Returns ranked list of matching doc slugs.",
      inputSchema: searchDocsInput.shape,
    },
    async (input) =>
      handleSearchDocs(docs, input, {
        index: searchIndex ?? undefined,
      }),
  )

  server.registerTool(
    "get_doc",
    {
      title: "Get doc",
      description:
        "Fetch the full MDX content of a single doc by slug. Slug format: 'category/slug' or just 'slug' (first match wins).",
      inputSchema: getDocInput.shape,
    },
    async (input) => handleGetDoc(docs, input),
  )

  server.registerTool(
    "list_docs",
    {
      title: "List docs",
      description:
        "List all available docs grouped by category. Optionally filter by a single category slug.",
      inputSchema: listDocsInput.shape,
    },
    async (input) => handleListDocs(docs, categories, input),
  )

  return {
    server,
    deps: { contentDir, docs, categories, searchIndex, searchIndexPath },
  }
}
