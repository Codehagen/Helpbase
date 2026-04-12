import { Command } from "commander"
import { note } from "@clack/prompts"
import { spinner } from "../lib/ui.js"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import {
  planArticleWrites,
  resolveModel,
  MissingApiKeyError,
  GatewayError,
  TEST_MODEL,
} from "@workspace/shared/ai"
import {
  scrapeUrl,
  generateArticlesFromContent,
} from "@workspace/shared/ai-text"
import {
  generateArticlesFromScreenshots,
} from "@workspace/shared/ai-visual"
import {
  readScreenshotsDir,
  readCaptions,
  resizeForModel,
} from "@workspace/shared/screenshots"
import { HelpbaseError } from "../lib/errors.js"

export const generateCommand = new Command("generate")
  .description("Generate help articles using AI")
  .option("--url <url>", "Scrape a website URL and generate articles")
  .option("--repo <path>", "Read a local repository and generate articles")
  .option("--screenshots <dir>", "Generate visual how-to articles from a folder of screenshots")
  .option("--title <title>", "Title for the generated how-to guide (required with --screenshots when no --url)")
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
  .option("--yes", "Skip interactive confirmations (for CI/scripted use)")
  .option("--no-overwrite", "Error instead of overwriting existing image assets")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase generate --url https://myproduct.com
  $ helpbase generate --url https://myproduct.com --test           # cheap model
  $ helpbase generate --screenshots ./flow --title "How to invite a teammate"
  $ helpbase generate --url https://myproduct.com --dry-run        # preview without spending tokens

Set AI_GATEWAY_API_KEY first — get a key at https://vercel.com/ai-gateway.
`,
  )
  .action(async (opts) => {
    if (!opts.url && !opts.repo && !opts.screenshots) {
      console.error(
        `${pc.red("✖")} Provide a source: ${pc.cyan("--url <url>")}, ${pc.cyan("--screenshots <dir>")}, or ${pc.cyan("--repo <path>")}\n` +
        `\n  Examples:\n` +
        `    ${pc.dim("$")} helpbase generate --url https://myproduct.com\n` +
        `    ${pc.dim("$")} helpbase generate --screenshots ./my-screenshots --title "How to invite a teammate"\n` +
        `    ${pc.dim("$")} helpbase generate --url https://myproduct.com --screenshots ./my-screenshots\n`,
      )
      process.exit(1)
    }

    // --screenshots without --url requires --title
    if (opts.screenshots && !opts.url && !opts.title) {
      console.error(
        `${pc.red("✖")} Provide --title when using --screenshots without --url\n` +
        `\n  Example:\n` +
        `    ${pc.dim("$")} helpbase generate --screenshots ./my-screenshots --title "How to invite a teammate"\n`,
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

    // ── Screenshot mode ──────────────────────────────────────────
    if (opts.screenshots) {
      // Privacy warning on first use
      printPrivacyWarning()

      // Read and validate screenshots
      let screenshots
      try {
        screenshots = readScreenshotsDir(opts.screenshots)
      } catch (err) {
        console.error(
          `\n${pc.red("✖")} ${err instanceof Error ? err.message : "Failed to read screenshots"}\n`,
        )
        process.exit(1)
      }

      console.log(
        `  ${pc.dim("›")} Found ${pc.bold(String(screenshots.length))} screenshots`,
      )
      for (const ss of screenshots) {
        console.log(`    ${pc.dim(`${ss.order}.`)} ${ss.filename}`)
      }

      // Read optional captions
      let captions
      try {
        captions = readCaptions(opts.screenshots)
        if (Object.keys(captions).length > 0) {
          console.log(
            `  ${pc.dim("›")} Loaded captions for ${Object.keys(captions).length} images`,
          )
        }
      } catch (err) {
        console.error(
          `\n${pc.red("✖")} ${err instanceof Error ? err.message : "Failed to read captions"}\n`,
        )
        process.exit(1)
      }

      // Resize images for model
      s.start("Preparing images...")
      const warnings: string[] = []
      for (const ss of screenshots) {
        try {
          const result = await resizeForModel(ss.buffer, ss.filename)
          ss.buffer = result.buffer
          if (result.warning) warnings.push(result.warning)
        } catch (err) {
          s.stop(pc.red("Failed"))
          console.error(
            `\n${pc.red("✖")} ${err instanceof Error ? err.message : "Image processing failed"}\n`,
          )
          process.exit(1)
        }
      }
      s.stop("Images ready!")

      for (const w of warnings) {
        console.log(`  ${pc.yellow("⚠")} ${w}`)
      }

      // Optional: scrape URL for combined mode
      let textContext: string | undefined
      if (opts.url) {
        s.start(`Scraping ${pc.cyan(opts.url)} for context...`)
        try {
          textContext = await scrapeUrl(opts.url)
          s.stop("Website scraped!")
        } catch (err) {
          s.stop(pc.yellow("Scrape failed (continuing with screenshots only)"))
          console.log(
            `  ${pc.dim("›")} ${err instanceof Error ? err.message : "Scrape error"}`,
          )
        }
      }

      if (opts.dryRun) {
        const totalSize = screenshots.reduce((sum, ss) => sum + ss.buffer.length, 0)
        console.log("")
        console.log(`${pc.dim("›")} ${pc.bold("Dry run — no LLM call")}`)
        console.log(`  Model:            ${pc.cyan(model)}`)
        console.log(`  Screenshots:      ${screenshots.length}`)
        console.log(`  Total image size: ${(totalSize / 1_000_000).toFixed(1)}MB`)
        if (textContext) {
          console.log(`  Text context:     ${textContext.length.toLocaleString()} chars`)
        }
        console.log(`  Output dir:       ${pc.cyan(outputDir)}`)
        console.log("")
        console.log(`  ${pc.dim("Remove --dry-run to actually generate articles.")}`)
        return
      }

      // Generate articles
      s.start("Generating visual how-to guide with AI...")
      let result
      try {
        result = await generateArticlesFromScreenshots({
          screenshots,
          captions,
          textContext,
          sourceUrl: opts.url,
          title: opts.title,
          model,
        })
      } catch (err) {
        s.stop(pc.red("Failed"))
        printGenerateError(err)
        process.exit(1)
      }
      s.stop(`Generated ${pc.bold(String(result.articles.length))} article${result.articles.length === 1 ? "" : "s"}!`)

      // Write articles + copy images
      const plans = planArticleWrites(
        result.articles,
        outputDir,
        result.imagesByArticle,
      )
      const copiedAssets: string[] = [] // Track for orphan cleanup on error
      const categoriesWritten = new Set<string>()

      try {
        for (const plan of plans) {
          const categoryDir = path.join(outputDir, plan.categorySlug)
          fs.mkdirSync(categoryDir, { recursive: true })

          if (!categoriesWritten.has(plan.categorySlug)) {
            const metaPath = path.join(categoryDir, "_category.json")
            if (!fs.existsSync(metaPath)) {
              fs.writeFileSync(
                metaPath,
                JSON.stringify(
                  { title: plan.categoryTitle, description: "", icon: "file-text", order: 1 },
                  null,
                  2,
                ),
              )
            }
            categoriesWritten.add(plan.categorySlug)
          }

          // Copy image assets to article's asset folder
          if (plan.imageFiles?.length) {
            const assetDir = path.join(
              outputDir,
              plan.categorySlug,
              plan.articleSlug,
            )
            fs.mkdirSync(assetDir, { recursive: true })

            for (const img of plan.imageFiles) {
              const destPath = path.join(assetDir, img.filename)

              // --no-overwrite check (commander's --no-X sets opts.overwrite=false)
              if (opts.overwrite === false && fs.existsSync(destPath)) {
                throw new HelpbaseError({
                  code: "E_FILE_EXISTS",
                  problem: `File exists: ${destPath}`,
                  cause: "`--no-overwrite` is set, and this image already lives at the destination.",
                  fix: [
                    "Remove `--no-overwrite` to allow overwriting.",
                    "Or delete the existing file and re-run `helpbase generate`.",
                  ],
                })
              }

              fs.copyFileSync(img.sourcePath, destPath)
              copiedAssets.push(destPath)
              console.log(
                `  ${pc.blue("◆")} ${plan.categorySlug}/${plan.articleSlug}/${img.filename}`,
              )
            }
          }

          fs.writeFileSync(plan.filePath, plan.mdx)

          // Round-trip frontmatter check
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
      } catch (err) {
        // Orphan cleanup: remove copied assets if generation failed mid-way
        for (const assetPath of copiedAssets) {
          try {
            fs.unlinkSync(assetPath)
          } catch {
            // Best effort cleanup
          }
        }
        console.error(
          `\n${pc.red("✖")} ${err instanceof Error ? err.message : "Failed to write articles"}\n`,
        )
        process.exit(1)
      }

      note(
        `Run ${pc.cyan("helpbase dev")} to preview your articles.`,
        "Done",
      )
      return
    }

    // ── URL mode (original flow, unchanged) ──────────────────────
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

// ── Privacy warning ────────────────────────────────────────────────

const PRIVACY_FLAG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".helpbase-screenshots-warned",
)

function printPrivacyWarning(): void {
  if (fs.existsSync(PRIVACY_FLAG_PATH)) return

  console.log(
    `\n${pc.yellow("⚠")} Screenshots will be sent to Gemini (Google) for AI processing.` +
    `\n  Do not include images containing secrets, API keys, or sensitive customer data.\n`,
  )

  // Mark as warned
  try {
    fs.writeFileSync(PRIVACY_FLAG_PATH, new Date().toISOString())
  } catch {
    // Best effort — don't break the flow
  }
}

// ── Error formatting ───────────────────────────────────────────────

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
    `  Fix: Check the source and try again.\n` +
    `  Docs: https://helpbase.dev/docs/troubleshooting#generate-errors\n`,
  )
}
