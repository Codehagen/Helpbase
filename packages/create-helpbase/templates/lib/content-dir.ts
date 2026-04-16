import path from "node:path"

/**
 * Resolve the MDX content directory the renderer reads from.
 *
 * Priority order:
 *   1. `HELPBASE_CONTENT_DIR` env var (absolute, or relative to cwd).
 *      Matches the MCP server's convention so one env var points both
 *      the human-facing renderer and the agent-facing MCP server at the
 *      same docs. Used by `helpbase preview` to render .helpbase/docs/
 *      from a different project without scaffolding files in it.
 *   2. `<cwd>/content` — the default when running a standard scaffold
 *      where content ships in-repo.
 *
 * Kept in its own file (not inlined in `content.ts`) so unit tests can
 * import it without pulling in the whole MDX + React stack.
 */
/**
 * `env` is typed as a plain record (not NodeJS.ProcessEnv) so tests can
 * pass `{}` or `{ HELPBASE_CONTENT_DIR: "..." }` without TypeScript
 * complaining about the rest of the process.env surface (NODE_ENV,
 * PATH, PWD, etc.). process.env is still compatible because it extends
 * this shape.
 */
export function resolveContentDir(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string {
  const envOverride = env.HELPBASE_CONTENT_DIR
  if (envOverride && envOverride.length > 0) {
    return path.isAbsolute(envOverride) ? envOverride : path.resolve(cwd, envOverride)
  }
  return path.join(cwd, "content")
}
