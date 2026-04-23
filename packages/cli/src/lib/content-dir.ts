import fs from "node:fs"
import path from "node:path"

// More-specific candidates come first so `content/docs/` wins over a
// sibling `content/` that might hold non-doc assets (blog posts, changelog
// entries, marketing copy). `content/docs/` is a common MDX-in-subfolder
// convention for docs-only content.
//
// Source of truth mirror: packages/mcp/src/content/loader.ts. Keep in
// lockstep — content-dir.unit.test.ts asserts the order here.
export const CONTENT_DIR_CANDIDATES = [
  "apps/web/content",
  "content/docs",
  "content",
] as const

/**
 * Find the MDX content directory for `helpbase sync`.
 *
 * Resolution order:
 *   1. HELPBASE_CONTENT_DIR env var (absolute or relative to startDir)
 *   2. Walk up from startDir trying each candidate in order:
 *      - `apps/web/content/` (monorepo shape)
 *      - `content/docs/`     (MDX-in-subfolder shape)
 *      - `content/`          (flat shape)
 *
 * Returns an absolute path. Returns null if nothing is found — callers
 * decide how to surface the miss (usually a CLI-friendly HelpbaseError).
 */
export function findContentDir(startDir: string = process.cwd()): string | null {
  const envOverride = process.env.HELPBASE_CONTENT_DIR
  if (envOverride && envOverride.length > 0) {
    const resolved = path.isAbsolute(envOverride)
      ? envOverride
      : path.resolve(startDir, envOverride)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return null
    }
    return resolved
  }

  let dir = path.resolve(startDir)
  const root = path.parse(dir).root
  while (true) {
    for (const candidate of CONTENT_DIR_CANDIDATES) {
      const full = path.join(dir, candidate)
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
        return full
      }
    }
    if (dir === root) break
    dir = path.dirname(dir)
  }
  return null
}
