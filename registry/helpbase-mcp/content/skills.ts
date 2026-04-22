import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

/**
 * A skill is a markdown file living under `.helpbase/skills/` in the user's
 * repo. It encodes a rule, convention, or style guide that an AI agent
 * should pull when authoring content for this product — tone/voice,
 * formatting standards, terminology, whatever the docs team wants
 * enforced.
 *
 * Served via the MCP tools `list_skills` and `get_skill`. The docs team
 * edits the files in git; downstream agents and tools read them over the
 * wire. No schema migration, no dashboard — markdown wins.
 *
 * This is v1 of the "skills server" Shadcn asked about on 2026-04-22:
 * https://x.com/shadcn/... ("interesting to see if this can also be a
 * skills server... enforcing tone, writing styles... editable by the
 * docs team... pulled by other teams").
 */
export interface Skill {
  /** Filename without the .md extension. Used as the identifier. */
  name: string
  /** Frontmatter `description`, or empty string if absent. */
  description: string
  /** Full post-frontmatter body. */
  content: string
  /** Absolute path, for diagnostics. */
  filePath: string
}

/**
 * Find the `.helpbase/skills/` directory.
 *
 * Resolution order:
 *   1. HELPBASE_SKILLS_DIR env var (absolute or relative to cwd)
 *   2. Walk up from cwd looking for `.helpbase/skills/`
 *
 * Returns `null` when no skills directory is found. Unlike findContentDir
 * (which throws), skills are OPTIONAL — a repo without skills should
 * surface an empty list, not crash the server.
 */
export function findSkillsDir(startDir: string = process.cwd()): string | null {
  const envOverride = process.env.HELPBASE_SKILLS_DIR
  if (envOverride && envOverride.length > 0) {
    const resolved = path.isAbsolute(envOverride)
      ? envOverride
      : path.resolve(startDir, envOverride)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      // Explicit override that doesn't exist IS an error — loud signal
      // that the user's env is misconfigured rather than silently empty.
      throw new Error(
        `HELPBASE_SKILLS_DIR points at ${resolved} but that directory does not exist.`,
      )
    }
    return resolved
  }

  let dir = path.resolve(startDir)
  const root = path.parse(dir).root
  while (true) {
    const candidate = path.join(dir, ".helpbase", "skills")
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate
    }
    if (dir === root) return null
    dir = path.dirname(dir)
  }
}

/**
 * Load all skills from `.helpbase/skills/*.md`.
 *
 * Files prefixed with `_` are treated as drafts and skipped (matches the
 * content/docs convention). Only top-level `.md` files are loaded — no
 * subdirectories, no grouping. Keep the layout flat.
 *
 * Malformed frontmatter logs to stderr and skips the file rather than
 * crashing the server, mirroring loader.ts's lenient posture.
 */
export function loadSkills(skillsDir: string | null): Skill[] {
  if (!skillsDir) return []
  if (!fs.existsSync(skillsDir)) return []

  const entries = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .filter((e) => !e.name.startsWith("_"))
    .filter((e) => e.name.endsWith(".md"))

  const skills: Skill[] = []
  for (const entry of entries) {
    const filePath = path.join(skillsDir, entry.name)
    const name = entry.name.replace(/\.md$/, "")

    let raw: string
    try {
      raw = fs.readFileSync(filePath, "utf-8")
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(
        `[helpbase-mcp] Skipping skill ${entry.name}: read failed (${msg})\n`,
      )
      continue
    }

    let parsed: ReturnType<typeof matter>
    try {
      parsed = matter(raw)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(
        `[helpbase-mcp] Skipping skill ${entry.name}: malformed frontmatter (${msg})\n`,
      )
      continue
    }

    const description =
      typeof parsed.data["description"] === "string"
        ? String(parsed.data["description"]).trim()
        : ""

    skills.push({
      name,
      description,
      content: parsed.content.trim(),
      filePath,
    })
  }

  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}
