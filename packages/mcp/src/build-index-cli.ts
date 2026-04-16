#!/usr/bin/env node

import path from "node:path"
import process from "node:process"
import { findContentDir, loadDocs } from "./content/loader.js"
import {
  buildSearchIndex,
  saveSearchIndex,
  resolveDefaultIndexPath,
  DEFAULT_SEMANTIC_MODEL,
} from "./content/semantic.js"

/**
 * Offline index builder for @helpbase/mcp semantic search.
 *
 * Usage:
 *   helpbase-mcp-build-index [--content-dir <path>] [--output <file>] [--model <id>]
 *
 * Environment:
 *   HELPBASE_CONTENT_DIR     — default content dir
 *   HELPBASE_SEARCH_INDEX    — default output path
 *
 * Requires the optional peer dep `@xenova/transformers` to be installed.
 */

interface Args {
  contentDir?: string
  output?: string
  model?: string
  help?: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const next = argv[i + 1]
    switch (arg) {
      case "--content-dir":
        out.contentDir = next
        i++
        break
      case "-o":
      case "--output":
        out.output = next
        i++
        break
      case "--model":
        out.model = next
        i++
        break
      case "-h":
      case "--help":
        out.help = true
        break
      default:
        if (arg.startsWith("--")) {
          process.stderr.write(`Unknown flag: ${arg}\n`)
          process.exit(2)
        }
    }
  }
  return out
}

function printHelp(): void {
  process.stdout.write(
    [
      "helpbase-mcp-build-index — build the semantic search index for @helpbase/mcp",
      "",
      "Usage:",
      "  helpbase-mcp-build-index [--content-dir <path>] [--output <file>] [--model <id>]",
      "",
      "Options:",
      "  --content-dir <path>   Path to your content dir (default: auto-detect or $HELPBASE_CONTENT_DIR)",
      "  -o, --output <file>    Where to write the index JSON (default: $HELPBASE_SEARCH_INDEX or .search-index.json beside content)",
      `  --model <id>           Transformers.js model id (default: ${DEFAULT_SEMANTIC_MODEL})`,
      "  -h, --help             Show this help",
      "",
      "Requires the optional peer dependency @xenova/transformers to be installed:",
      "  npm install @xenova/transformers",
      "",
    ].join("\n"),
  )
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const contentDir = args.contentDir
    ? path.resolve(process.cwd(), args.contentDir)
    : findContentDir()

  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : resolveDefaultIndexPath(contentDir)

  const model = args.model ?? DEFAULT_SEMANTIC_MODEL

  process.stderr.write(
    `[helpbase-mcp-build-index] Content dir: ${contentDir}\n` +
      `[helpbase-mcp-build-index] Output:      ${outputPath}\n` +
      `[helpbase-mcp-build-index] Model:       ${model}\n`,
  )

  const docs = loadDocs(contentDir)
  if (docs.length === 0) {
    process.stderr.write(
      `[helpbase-mcp-build-index] No docs found — nothing to index.\n`,
    )
    process.exit(1)
  }

  process.stderr.write(
    `[helpbase-mcp-build-index] Embedding ${docs.length} doc(s)...\n`,
  )
  const started = Date.now()
  const index = await buildSearchIndex(docs, { model })
  const elapsedMs = Date.now() - started

  saveSearchIndex(index, outputPath)
  process.stderr.write(
    `[helpbase-mcp-build-index] Wrote ${index.entries.length} vectors ` +
      `(dim=${index.dim}) in ${elapsedMs}ms\n`,
  )
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[helpbase-mcp-build-index] ${msg}\n`)
  process.exit(1)
})
