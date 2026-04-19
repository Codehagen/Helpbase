import fs from "node:fs"
import path from "node:path"

/**
 * Write an `mcp.json` hint file at the project root, pointing at the
 * scaffolded `content/` directory so the user can paste a block into
 * Claude Desktop / Cursor / Claude Code and their agent immediately
 * sees the cited help-center articles.
 *
 * Shape matches `helpbase ingest`'s emit so returning users who already
 * know one layout find the other familiar. The key difference: the
 * content dir here is `<projectDir>/content/` (what the Next.js app
 * renders), NOT `.helpbase/docs/` (the agent-only layout helpbase
 * ingest emits).
 *
 * The file is a hint, not a working MCP client config. The user copies
 * one of the per-client blocks into their real config file. Absolute
 * paths are machine-local; the file should be added to `.gitignore`.
 */
export function emitMcpJson(projectDir: string): string {
  const contentDir = path.join(projectDir, "content")
  const helpbaseBlock = {
    command: "npx",
    args: ["@helpbase/mcp@latest"],
    env: {
      HELPBASE_CONTENT_DIR: contentDir,
    },
  }
  // Shadcn ships its own MCP server. Wiring it alongside helpbase means a
  // user pasting either block gets BOTH servers registered: helpbase for
  // citations into their docs, shadcn for "add a card component" natural-
  // language UI extension. Same registry the scaffold itself was built
  // from, so the experience compounds (the help center renders shadcn-
  // shaped components; the agent that edits it can install more).
  // See https://ui.shadcn.com/docs/mcp for client-side prompts.
  const shadcnBlock = {
    command: "npx",
    args: ["shadcn@latest", "mcp"],
  }
  const mcpServers = {
    helpbase: helpbaseBlock,
    shadcn: shadcnBlock,
  }
  const hint = {
    _comment:
      "This file is a HINT — copy one of the blocks below into your MCP client's config. Do NOT commit: HELPBASE_CONTENT_DIR is an absolute machine-local path. Two servers ship by default: `helpbase` (cite your docs) and `shadcn` (install components from natural language).",
    helpbaseMcpVersion: "1",
    claude_desktop: { mcpServers },
    cursor: { mcpServers },
    claude_code: { mcpServers },
  }
  const mcpJsonPath = path.join(projectDir, "mcp.json")
  fs.writeFileSync(mcpJsonPath, JSON.stringify(hint, null, 2) + "\n", "utf8")
  return mcpJsonPath
}

/**
 * Per-OS path where each MCP client reads its config. Used in the
 * "What next" output so a user knows where to paste the block.
 */
export function mcpClientConfigPaths(): Array<{ client: string; path: string }> {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "~"
  const isWindows = process.platform === "win32"
  if (isWindows) {
    const appData = process.env.APPDATA ?? `${home}\\AppData\\Roaming`
    return [
      { client: "Claude Desktop", path: `${appData}\\Claude\\claude_desktop_config.json` },
      { client: "Cursor", path: `${home}\\.cursor\\mcp.json` },
      { client: "Claude Code", path: `${home}\\.claude\\mcp.json` },
    ]
  }
  const isMac = process.platform === "darwin"
  const claudeDesktop = isMac
    ? `${home}/Library/Application Support/Claude/claude_desktop_config.json`
    : `${home}/.config/Claude/claude_desktop_config.json`
  return [
    { client: "Claude Desktop", path: claudeDesktop },
    { client: "Cursor", path: `${home}/.cursor/mcp.json` },
    { client: "Claude Code", path: `${home}/.claude/mcp.json` },
  ]
}
