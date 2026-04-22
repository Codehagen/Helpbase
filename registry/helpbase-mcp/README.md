# Helpbase MCP Server

Self-hosted Model Context Protocol server for your docs. Runs as source code
in your repo (no vendored npm binary), reads your MDX, exposes three tools
(`search_docs`, `get_doc`, `list_docs`) over stdio to any MCP client.

## Run it

After `npx shadcn add`, you have the server source at `mcp/` and `tsx` in
your devDependencies. Set the content directory and start the server.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "helpbase": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/your/repo/mcp/index.ts"],
      "env": {
        "HELPBASE_CONTENT_DIR": "/absolute/path/to/your/repo/apps/web/content"
      }
    }
  }
}
```

Restart Claude Desktop. The three tools appear in the tool picker.

### Cursor / Zed / Windsurf / any MCP client

Same pattern: point the client at `npx tsx <absolute-path>/mcp/index.ts` with
`HELPBASE_CONTENT_DIR` in the env block.

### Local test

```bash
HELPBASE_CONTENT_DIR=./apps/web/content npx tsx mcp/index.ts
# sends bootstrap line to stderr, speaks JSON-RPC over stdin/stdout
```

## Content discovery

If `HELPBASE_CONTENT_DIR` is not set, the server walks up from its cwd looking
for (in order):

- `apps/web/content/` — monorepo shape
- `content/docs/` — MDX-in-subfolder shape (docs alongside blog, changelog, etc.)
- `content/` — flat shape

The first match wins. If none exists, the server fails on startup with a clear
error — no silent empty index.

## Why ship as source instead of an npm dep?

Because it's yours. Your MCP server lives in your repo. No vendor sits between
your docs and the agents that read them. Edit it, fork it, extend the tools,
add your own — it's code you own.

If you want the zero-config path instead, `npm i @helpbase/mcp` gets you the
same server as a published binary. Both paths are supported; this one just
keeps the code in your hands.
