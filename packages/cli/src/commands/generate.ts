import { Command } from "commander"
import { spinner, note } from "@clack/prompts"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import {
  scrapeUrl,
  generateArticlesFromContent,
  planArticleWrites,
  resolveModel,
  MissingApiKeyError,
  GatewayError,
  TEST_MODEL,
} from "@workspace/shared/ai"

export const generateCommand = new Command("generate")
  .description("Generate help articles using AI")
  .option("--url <url>", "Scrape a website URL and generate articles")
  .option("--repo <path>", "Read a local repository and generate articles")
  .option("-o, --output <dir>", "Output directory for generated articles", "content")
  .option(
    "--test",
    `Use the cheap test model (${TEST_MODEL}) and print model info`,
  )
  .option("--model <id>", "Override the model ID (e.g. anthropic/claude-sonnet-4.6)")
  .option(
    "--debug",
    "Write the raw scraped text to <output>/_scrape.txt before calling the LLM (useful when debugging bad article quality)",
  )
  .option(
    "--dry-run",
    "Scrape the URL and print what would be sent to the LLM, without spending tokens",
  )
  .action(async (opts) => {
    if (!opts.url && !opts.repo) {
      console.error(
        `${pc.red("✖")} Provide a source: ${pc.cyan("--url <url>")} or ${pc.cyan("--repo <path>")}\n` +
        `\n  Examples:\n` +
        `    ${pc.dim("$")} helpbase generate --url https://myproduct.com\n` +
        `    ${pc.dim("$")} helpbase generate --url https://myproduct.com --test\n` +
        `    ${pc.dim("$")} helpbase generate --repo ./my-app\n`,
      )
      process.exit(1)
    }

    const outputDir = path.resolve(process.cwd(), opts.output)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const model = resolveModel({ test: opts.test, modelOverride: opts.model })
    if (opts.test || opts.model) {
      console.log(`${pc.dim("›")} Using model: ${pc.cyan(model)}`)
    }

    const s = spinner()

    if (opts.url) {
      s.start(`Scraping ${pc.cyan(opts.url)}...`)

      let markdown: string
      try {
        markdown = await scrapeUrl(opts.url)
        s.stop("Website scraped!")
      } catch (err) {
        s.stop(pc.red("Failed"))
        printScrapeError(opts.url, err)
        process.exit(1)
      }

      if (opts.debug) {
        const scrapePath = path.join(outputDir, "_scrape.txt")
        fs.writeFileSync(scrapePath, markdown)
        console.log(
          `  ${pc.dim("›")} Wrote scraped text to ${pc.cyan(scrapePath)} (${markdown.length.toLocaleString()} chars)`,
        )
      }

      if (opts.dryRun) {
        // Rough token estimate: 1 token ≈ 4 chars for English prose.
        const estimatedTokens = Math.ceil(markdown.length / 4)
        console.log("")
        console.log(`${pc.dim("›")} ${pc.bold("Dry run — no LLM call")}`)
        console.log(`  Model:            ${pc.cyan(model)}`)
        console.log(`  Source URL:       ${pc.cyan(opts.url)}`)
        console.log(`  Scraped chars:    ${markdown.length.toLocaleString()}`)
        console.log(
          `  Prompt tokens ~:  ${estimatedTokens.toLocaleString()} (plus ~200 for instructions)`,
        )
        console.log(`  Output dir:       ${pc.cyan(outputDir)}`)
        if (opts.debug) {
          console.log(
            `  Scrape preview:   ${pc.cyan(path.join(outputDir, "_scrape.txt"))}`,
          )
        }
        console.log("")
        console.log(
          `  ${pc.dim("Remove --dry-run to actually generate articles.")}`,
        )
        return
      }

      s.start("Generating help articles with AI...")
      let articles
      try {
        articles = await generateArticlesFromContent({
          content: markdown,
          sourceUrl: opts.url,
          model,
        })
      } catch (err) {
        s.stop(pc.red("Failed"))
        printGenerateError(err)
        process.exit(1)
      }
      s.stop(`Generated ${pc.bold(String(articles.length))} articles!`)

      const plans = planArticleWrites(articles, outputDir)
      const categoriesWritten = new Set<string>()
      for (const plan of plans) {
        const categoryDir = path.join(outputDir, plan.categorySlug)
        fs.mkdirSync(categoryDir, { recursive: true })

        if (!categoriesWritten.has(plan.categorySlug)) {
          const metaPath = path.join(categoryDir, "_category.json")
          if (!fs.existsSync(metaPath)) {
            fs.writeFileSync(
              metaPath,
              JSON.stringify(
                {
                  title: plan.categoryTitle,
                  description: "",
                  icon: "file-text",
                  order: 1,
                },
                null,
                2,
              ),
            )
          }
          categoriesWritten.add(plan.categorySlug)
        }

        fs.writeFileSync(plan.filePath, plan.mdx)

        // Round-trip check: confirm the file we just wrote parses cleanly
        // through gray-matter. Belt-and-suspenders for future edge cases
        // in articleToMdx that our unit tests don't cover yet.
        try {
          matter(fs.readFileSync(plan.filePath, "utf-8"))
        } catch (parseErr) {
          console.error(
            `\n${pc.red("✖")} Generated file has invalid frontmatter: ${plan.filePath}\n` +
              `  Reason: ${parseErr instanceof Error ? parseErr.message : "parse error"}\n` +
              `  Fix: This is a bug in articleToMdx — please file an issue with the file contents.\n` +
              `  Docs: https://helpbase.dev/docs/troubleshooting#bad-frontmatter\n`,
          )
          process.exit(1)
        }

        console.log(
          `  ${pc.green("+")} ${plan.categorySlug}/${plan.articleSlug}.mdx`,
        )
      }

      note(
        `Run ${pc.cyan("helpbase dev")} to preview your articles.`,
        "Done",
      )
      return
    }

    if (opts.repo) {
      console.error(
        `\n${pc.red("✖")} Repository-based generation is not yet implemented.\n` +
        `  Fix: Use ${pc.cyan("--url <url>")} for now.\n` +
        `  Track: https://helpbase.dev/docs/troubleshooting#repo-generation\n`,
      )
      process.exit(1)
    }
  })

function printScrapeError(url: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : "Unknown error"
  console.error(
    `\n${pc.red("✖")} Could not generate articles from ${pc.cyan(url)}\n` +
    `  Reason: ${reason}\n` +
    `  Fix: Check the URL is accessible and try again.\n` +
    `  Docs: https://helpbase.dev/docs/troubleshooting#generate-errors\n`,
  )
}

function printGenerateError(err: unknown): void {
  if (err instanceof MissingApiKeyError) {
    console.error(
      `\n${pc.red("✖")} Could not generate articles\n` +
      `  Reason: AI_GATEWAY_API_KEY is not set.\n` +
      `  Fix: Create a key at ${pc.cyan("https://vercel.com/ai-gateway")} and export it:\n` +
      `       ${pc.dim("$")} export AI_GATEWAY_API_KEY=your_key_here\n` +
      `  Docs: https://helpbase.dev/docs/troubleshooting#missing-api-key\n`,
    )
    return
  }

  if (err instanceof GatewayError) {
    console.error(
      `\n${pc.red("✖")} Could not generate articles\n` +
      `  Reason: ${err.message}\n` +
      `  Fix: Check the model ID is valid and your Gateway quota is not exhausted.\n` +
      `       Try ${pc.cyan("--test")} to use a cheap fallback model, or ${pc.cyan("--model <id>")} to override.\n` +
      `  Docs: https://helpbase.dev/docs/troubleshooting#gateway-errors\n`,
    )
    return
  }

  const reason = err instanceof Error ? err.message : "Unknown error"
  console.error(
    `\n${pc.red("✖")} Could not generate articles\n` +
    `  Reason: ${reason}\n` +
    `  Fix: Check the URL and try again.\n` +
    `  Docs: https://helpbase.dev/docs/troubleshooting#generate-errors\n`,
  )
}
