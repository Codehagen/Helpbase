/**
 * Shape a parsed article (frontmatter + body) into a self-contained
 * markdown document agents can consume.
 *
 * The stored MDX strips its frontmatter during rendering, so raw-file
 * passthrough isn't possible — the title lives in frontmatter, not in
 * the body. We prepend `# ${title}` and an optional description so the
 * response has the same structure an agent gets from the MCP `get_doc`
 * tool. Keeping the two surfaces aligned means agents can switch
 * between HTTP Accept negotiation and MCP without re-learning shape.
 */

export function renderArticleAsMarkdown(opts: {
  title: string
  description?: string
  body: string
}): string {
  const parts: string[] = [`# ${opts.title}`]
  if (opts.description && opts.description.trim().length > 0) {
    parts.push(opts.description.trim())
  }
  const trimmedBody = opts.body.trim()
  if (trimmedBody.length > 0) parts.push(trimmedBody)
  return parts.join("\n\n") + "\n"
}
