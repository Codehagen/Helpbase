import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  findContentDir,
  loadCategories,
  loadDocs,
  type CategoryMeta,
  type Doc,
} from "./content/loader.js"
import {
  findSkillsDir,
  loadSkills,
  type Skill,
} from "./content/skills.js"
import {
  handleSearchDocs,
  searchDocsInput,
} from "./tools/search-docs.js"
import { getDocInput, handleGetDoc } from "./tools/get-doc.js"
import { handleListDocs, listDocsInput } from "./tools/list-docs.js"
import { getSkillInput, handleGetSkill } from "./tools/get-skill.js"
import { handleListSkills, listSkillsInput } from "./tools/list-skills.js"
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
  /** Resolved .helpbase/skills/ directory, or null when none was found. */
  skillsDir: string | null
  /** Loaded skills. Empty when no skills dir is present — not an error. */
  skills: Skill[]
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
  /**
   * Pre-loaded docs. If provided, skips filesystem loading entirely —
   * contentDir and searchIndexPath are ignored. Used by the hosted tier
   * Vercel route to serve Supabase-backed content to the same tool
   * surface without duplicating tool definitions.
   */
  preloadedDocs?: Doc[]
  /**
   * Pre-loaded categories. Required when `preloadedDocs` is set.
   */
  preloadedCategories?: CategoryMeta[]
  /**
   * Override the skills dir. If omitted, resolves via findSkillsDir().
   * Pass `null` to force skills-off regardless of filesystem state.
   */
  skillsDir?: string | null
  /**
   * Pre-loaded skills. If provided, skips filesystem loading entirely.
   * Mirrors the preloadedDocs pattern for hosted/serverless contexts.
   */
  preloadedSkills?: Skill[]
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
  // Content source: either pre-loaded (hosted tier, Supabase) or filesystem
  // (stdio, local). Filesystem loading is skipped entirely when preloaded
  // docs are supplied — avoids relying on process.cwd() in serverless.
  let contentDir: string
  let docs: Doc[]
  let categories: CategoryMeta[]
  if (options.preloadedDocs) {
    contentDir = options.contentDir ?? ""
    docs = options.preloadedDocs
    categories = options.preloadedCategories ?? []
  } else {
    contentDir = options.contentDir ?? findContentDir()
    docs = loadDocs(contentDir)
    categories = loadCategories(contentDir)
  }

  // Skills are OPTIONAL. A repo without .helpbase/skills/ sees an empty
  // list via list_skills — not an error. Pre-loaded skills (hosted
  // tier) bypass filesystem walk entirely.
  let skillsDir: string | null
  let skills: Skill[]
  if (options.preloadedSkills) {
    skillsDir = options.skillsDir ?? null
    skills = options.preloadedSkills
  } else if (options.skillsDir === null) {
    skillsDir = null
    skills = []
  } else {
    skillsDir = options.skillsDir ?? findSkillsDir()
    skills = loadSkills(skillsDir)
  }

  let searchIndex: SearchIndex | null = null
  let searchIndexPath = ""
  // Semantic search index is filesystem-backed (see content/semantic.ts) and
  // only makes sense for the stdio path. Hosted tier does keyword FTS in
  // Postgres, so we skip semantic loading when preloaded docs are supplied.
  if (!options.preloadedDocs && options.searchIndexPath !== null) {
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
    version: options.version ?? "0.1.2",
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

  // Skills server (v1): agents pull writing-style / tone / formatting
  // rules from .helpbase/skills/. Empty-list response when no skills
  // are defined — no error, just silence. See content/skills.ts.
  server.registerTool(
    "list_skills",
    {
      title: "List skills",
      description:
        "List writing-style, tone, and formatting rules the docs team has " +
        "published for this product. Returns an empty list if no skills " +
        "are defined in .helpbase/skills/.",
      inputSchema: listSkillsInput.shape,
    },
    async () => handleListSkills(skills),
  )

  server.registerTool(
    "get_skill",
    {
      title: "Get skill",
      description:
        "Fetch the full content of a single skill (writing-style / tone / " +
        "formatting rule) by name. Use list_skills to discover available " +
        "names.",
      inputSchema: getSkillInput.shape,
    },
    async (input) => handleGetSkill(skills, input),
  )

  return {
    server,
    deps: {
      contentDir,
      docs,
      categories,
      searchIndex,
      searchIndexPath,
      skillsDir,
      skills,
    },
  }
}
