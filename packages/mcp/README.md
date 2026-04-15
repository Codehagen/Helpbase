# @helpbase/mcp

Self-hosted MCP server that exposes your Helpbase docs to AI agents.

Runs from your repo. Reads your MDX. Serves it over the Model Context Protocol
so Claude Desktop, Cursor, Zed, Windsurf, and any other MCP client can query
your docs without the content ever leaving your infrastructure.

## Install

```bash
npm i -g @helpbase/mcp
```

Or run without installing:

```bash
npx @helpbase/mcp
```

## Configure your MCP client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "helpbase": {
      "command": "npx",
      "args": ["-y", "@helpbase/mcp"],
      "env": {
        "HELPBASE_CONTENT_DIR": "/absolute/path/to/your/repo/apps/web/content"
      }
    }
  }
}
```

Restart Claude Desktop. The three tools (`search_docs`, `get_doc`, `list_docs`)
will show up in the tool picker.

### Cursor / Zed / Windsurf

Follow your client's MCP configuration docs; the command, args, and env are the
same as above.

## Tools

| Tool | What it does |
|------|--------------|
| `search_docs` | Keyword/title search over your MDX. Returns ranked slugs. |
| `get_doc` | Fetch a doc's full content by `category/slug` or just `slug`. |
| `list_docs` | Index of all docs grouped by category. Optional category filter. |

## Content discovery

The server resolves your docs in this order:

1. `HELPBASE_CONTENT_DIR` env var (absolute or relative to cwd)
2. Walks up from cwd looking for `apps/web/content/` (helpbase monorepo shape)
3. Walks up from cwd looking for `content/` (flat scaffold shape)

If none of these succeed, the server fails on startup with a clear error.

## Why this exists

Most hosted docs platforms give you an MCP endpoint, but they host it on their
infrastructure, against their copy of your content. That gives them a knowledge
layer you don't control.

`@helpbase/mcp` is the opposite: your MCP server runs as a subprocess the MCP
client spawns locally (or on your own host). Your content stays on your disk.
No vendor sits between your docs and the agents that read them.

## License

AGPL-3.0-only
