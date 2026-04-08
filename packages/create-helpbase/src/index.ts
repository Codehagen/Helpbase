#!/usr/bin/env node

import { intro, outro, text, spinner, note, cancel, isCancel } from "@clack/prompts"
import { Command } from "commander"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import {
  scrapeUrl,
  generateArticlesFromContent,
  planArticleWrites,
  resolveModel,
  MissingApiKeyError,
  GatewayError,
  TEST_MODEL,
} from "@workspace/shared/ai"
import { scaffoldProject, clearSampleContent } from "./scaffold.js"

interface RunOptions {
  url?: string
  install?: boolean
  open?: boolean
  test?: boolean
  model?: string
}

const PROJECT_NAME_REGEX = /^[a-z0-9-]+$/

function validateProjectName(name: string): string | undefined {
  if (!name) return "Project name is required"
  if (!PROJECT_NAME_REGEX.test(name)) {
    return "Use lowercase letters, numbers, and hyphens only"
  }
  return undefined
}

const program = new Command()
  .name("create-helpbase")
  .description("Create a beautiful, AI-powered help center in seconds")
  .version("0.0.1")
  .argument("[directory]", "Directory to create the project in")
  .option("--url <url>", "Generate articles from a website URL")
  .option("--no-install", "Skip dependency installation")
  .option("--no-open", "Don't open browser after setup")
  .option(
    "--test",
    `Use the cheap test model (${TEST_MODEL}) for AI generation`,
  )
  .option("--model <id>", "Override the AI model ID")
  .action(run)

program.parse()

async function run(directory: string | undefined, opts: RunOptions) {
  console.log()
  intro(pc.bgCyan(pc.black(" create-helpbase ")))

  // Non-TTY stdin means we're running inside a pipe, CI, or other
  // script context where we can't prompt the user. In that case,
  // skip all interactive prompts and require the directory arg.
  const isInteractive = Boolean(process.stdin.isTTY)

  // 1. Project name — validate CLI-provided names early so bad names fail
  //    before any filesystem work.
  if (directory !== undefined) {
    const err = validateProjectName(directory)
    if (err) {
      cancel(`${err}: ${pc.bold(directory)}`)
      process.exit(1)
    }
  }

  let projectName: string | symbol
  if (directory !== undefined) {
    projectName = directory
  } else if (!isInteractive) {
    cancel(
      "Project name is required when running non-interactively. " +
        "Pass a directory argument, e.g. `create-helpbase my-app`.",
    )
    process.exit(1)
  } else {
    projectName = await text({
      message: "What is your project called?",
      placeholder: "my-help-center",
      defaultValue: "my-help-center",
      validate(value) {
        return validateProjectName(value)
      },
    })
  }

  if (isCancel(projectName)) {
    cancel("Setup cancelled.")
    process.exit(0)
  }

  const projectDir = path.resolve(process.cwd(), projectName as string)

  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir)
    if (files.length > 0) {
      cancel(`Directory ${pc.bold(projectName as string)} already exists and is not empty.`)
      process.exit(1)
    }
  }

  // 2. Optional URL for AI content generation.
  //    Skip the prompt entirely in non-interactive mode so the tool can be
  //    scripted. Users who want AI generation pass --url explicitly.
  let siteUrl = opts.url
  if (!siteUrl && isInteractive) {
    const urlResponse = await text({
      message: "Generate articles from your website? (paste URL or leave empty to skip)",
      placeholder: "https://myproduct.com",
    })

    if (isCancel(urlResponse)) {
      cancel("Setup cancelled.")
      process.exit(0)
    }

    if (urlResponse && (urlResponse as string).trim().length > 0) {
      let url = (urlResponse as string).trim()
      if (!url.startsWith("http")) {
        url = `https://${url}`
      }
      siteUrl = url
    }
  }

  // 3. Scaffold the project
  const s = spinner()
  s.start("Creating your help center...")

  scaffoldProject({ projectName: projectName as string, projectDir })

  s.stop("Project scaffolded!")

  // 4. AI content generation (if URL provided).
  //
  // Sample content from apps/web/content/ ships with the templates dir, so
  // every fresh scaffold already has 3 sample articles in 2 categories.
  // When --url is supplied and generation succeeds, we wipe that sample
  // content first so the user sees their AI-generated articles cleanly,
  // not mixed with placeholders. When --url fails, we keep the sample
  // content (it's the natural fallback).
  if (siteUrl) {
    const model = resolveModel({ test: opts.test, modelOverride: opts.model })
    s.start(`Generating articles from ${pc.cyan(siteUrl)} with ${pc.dim(model)}...`)
    try {
      clearSampleContent(projectDir)
      await generateFromUrl(projectDir, siteUrl, model)
      s.stop("Articles generated!")
    } catch (err) {
      s.stop(pc.yellow("Couldn't generate articles. Sample content shipped with the scaffold remains."))
      printGenerationFallbackHint(err, siteUrl)
    }
  }

  // 5. Install dependencies
  if (opts.install !== false) {
    const pkgManager = detectPackageManager()
    s.start(`Installing dependencies with ${pkgManager}... (this may take a minute)`)
    try {
      execSync(`${pkgManager} install`, {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120000, // 2 minute timeout
      })
      s.stop("Dependencies installed!")
    } catch {
      s.stop(pc.yellow("Failed to install dependencies."))
      note(
        `Run ${pc.cyan(`cd ${projectName as string} && ${pkgManager} install`)} manually.`,
        "Manual install needed",
      )
    }
  }

  // 6. Done!
  const pkgManager = detectPackageManager()
  const cdCmd = projectDir === process.cwd()
    ? ""
    : `cd ${projectName as string}`

  note(
    [
      cdCmd && `${pc.cyan(cdCmd)}`,
      opts.install === false && `${pc.cyan(`${pkgManager} install`)}`,
      `${pc.cyan(`${pkgManager === "npm" ? "npm run" : pkgManager} dev`)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    "Next steps",
  )

  outro(pc.green("Your help center is ready!"))

  // 7. Auto-open browser
  if (opts.install !== false && opts.open !== false) {
    try {
      execSync(`${pkgManager === "npm" ? "npm run" : pkgManager} dev`, {
        cwd: projectDir,
        stdio: "inherit",
      })
    } catch {
      // Dev server was killed (Ctrl+C), that's fine
    }
  }
}

function detectPackageManager(): string {
  const userAgent = process.env.npm_config_user_agent ?? ""
  if (userAgent.startsWith("pnpm")) return "pnpm"
  if (userAgent.startsWith("yarn")) return "yarn"
  if (userAgent.startsWith("bun")) return "bun"
  return "npm"
}

/**
 * Scrape the URL, generate articles with the AI Gateway, and write them
 * into `<projectDir>/content/`. Throws on any failure so the caller can
 * fall back to sample content.
 */
async function generateFromUrl(
  projectDir: string,
  url: string,
  model: string,
): Promise<void> {
  const content = await scrapeUrl(url)
  const articles = await generateArticlesFromContent({
    content,
    sourceUrl: url,
    model,
  })

  const contentDir = path.join(projectDir, "content")
  fs.mkdirSync(contentDir, { recursive: true })

  const plans = planArticleWrites(articles, contentDir)
  const categoriesWritten = new Set<string>()

  for (const plan of plans) {
    const categoryDir = path.join(contentDir, plan.categorySlug)
    fs.mkdirSync(categoryDir, { recursive: true })

    if (!categoriesWritten.has(plan.categorySlug)) {
      fs.writeFileSync(
        path.join(categoryDir, "_category.json"),
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
      categoriesWritten.add(plan.categorySlug)
    }

    fs.writeFileSync(plan.filePath, plan.mdx)
  }
}

function printGenerationFallbackHint(err: unknown, url: string): void {
  if (err instanceof MissingApiKeyError) {
    note(
      `Set ${pc.cyan("AI_GATEWAY_API_KEY")} (get one at ${pc.cyan("https://vercel.com/ai-gateway")}) then run:\n` +
      `  ${pc.cyan(`helpbase generate --url ${url}`)}`,
      "AI generation skipped",
    )
    return
  }
  if (err instanceof GatewayError) {
    note(
      `Gateway error: ${err.message}\n` +
      `Retry with ${pc.cyan(`helpbase generate --url ${url} --test`)} to use a cheap fallback model.`,
      "AI generation failed",
    )
    return
  }
  note(
    `Run ${pc.cyan(`helpbase generate --url ${url}`)} later to retry.`,
    "Tip",
  )
}
