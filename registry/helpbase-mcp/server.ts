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

export interface ServerDeps {
  contentDir: string
  docs: Doc[]
  categories: CategoryMeta[]
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
   * Override the skills dir. If omitted, resolves via findSkillsDir().
   * Pass `null` to force skills-off regardless of filesystem state.
   */
  skillsDir?: string | null
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

  // Skills are OPTIONAL — no .helpbase/skills/ means an empty list,
  // not an error. Pass `skillsDir: null` to force skills-off.
  const skillsDir =
    options.skillsDir === null
      ? null
      : (options.skillsDir ?? findSkillsDir())
  const skills = loadSkills(skillsDir)

  const server = new McpServer({
    name: options.name ?? "helpbase-mcp",
    version: options.version ?? "0.0.1",
  })

  server.registerTool(
    "search_docs",
    {
      title: "Search docs",
      description:
        "Search Helpbase docs by keyword. Matches titles, descriptions, and body. Returns ranked list of matching doc slugs.",
      inputSchema: searchDocsInput.shape,
    },
    async (input) => handleSearchDocs(docs, input),
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

  // Skills server: agents pull writing-style / tone / formatting rules
  // from .helpbase/skills/. Empty list when no skills are defined — no
  // error, just silence. See content/skills.ts.
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
    deps: { contentDir, docs, categories, skillsDir, skills },
  }
}
