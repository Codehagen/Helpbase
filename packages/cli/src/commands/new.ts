import { Command } from "commander"
import { text, select, isCancel, cancel } from "@clack/prompts"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"
import { TEMPLATES, VALID_TYPES, slugify, type Template } from "../lib/templates.js"
import { nextSteps, ok } from "../lib/ui.js"
import { validateArticle } from "../audit.js"

export { VALID_TYPES }

export const newCommand = new Command("new")
  .description("Create a new article from a template")
  .option("-t, --type <type>", `Template type: ${VALID_TYPES.join(", ")}`)
  .option("-d, --dir <dir>", "Content directory", "content")
  .option("-c, --category <category>", "Category slug (defaults to the template's default)")
  .option("--title <title>", "Article title")
  .option("--description <description>", "Short description for the article frontmatter")
  .option("--slug <slug>", "Article slug (derived from title if omitted)")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase new                                                # fully interactive
  $ helpbase new --type how-to --title "Reset your password"
  $ helpbase new --type getting-started --title "Get started" --category intro
`,
  )
  .action(async (opts) => {
    // Flag mode: --type given and a valid template. Validate up front so the
    // user sees the error before any prompts fire.
    if (opts.type && !TEMPLATES[opts.type]) {
      console.error(
        `${pc.red("✖")} Unknown template type "${opts.type}"\n` +
          `  Valid types: ${VALID_TYPES.join(", ")}\n`,
      )
      process.exit(1)
    }

    const template = opts.type ? TEMPLATES[opts.type]! : await pickTemplate()
    const contentDir = path.resolve(process.cwd(), opts.dir)

    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true })
    }

    const categorySlug = opts.category ?? (opts.title ? template.defaultCategory : await pickCategory(contentDir, template))

    const title = opts.title ?? (await promptTitle(template))
    const description = opts.description ?? (opts.title ? "" : await promptDescription())

    const slug = opts.slug || slugify(title)

    const categoryDir = path.join(contentDir, categorySlug)
    fs.mkdirSync(categoryDir, { recursive: true })

    // Create _category.json if it doesn't exist
    const metaPath = path.join(categoryDir, "_category.json")
    if (!fs.existsSync(metaPath)) {
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          { title: template.label, description: "", icon: "file-text", order: 999 },
          null,
          2,
        ),
      )
    }

    const filePath = path.join(categoryDir, `${slug}.mdx`)
    if (fs.existsSync(filePath)) {
      console.error(`${pc.red("✖")} Article already exists: ${filePath}`)
      process.exit(1)
    }

    // JSON.stringify handles quotes, backslashes, and control chars so that
    // user-supplied titles/descriptions can't produce broken YAML frontmatter.
    // The H1 matches frontmatter.title and establishes page hierarchy, matching
    // the convention of every shipped article in apps/web/content/.
    const tagsYaml = `[${template.defaultTags.map((t) => JSON.stringify(t)).join(", ")}]`
    const mdx = `---
schemaVersion: 1
title: ${JSON.stringify(title)}
description: ${JSON.stringify(description)}
tags: ${tagsYaml}
order: 1
featured: false
---

# ${title}

${template.body}`

    fs.writeFileSync(filePath, mdx)

    // Create asset directory
    const assetDir = path.join(categoryDir, slug)
    fs.mkdirSync(assetDir, { recursive: true })

    console.log(`\n  ${pc.green("+")} Created: ${categorySlug}/${slug}.mdx`)
    console.log(`  ${pc.green("+")} Created: ${categorySlug}/${slug}/ (asset directory)`)
    console.log()

    // Validate the fresh article. A clean template should produce zero
    // findings — any issues here mean the template itself is broken and
    // the user would hit them again in dev. Better to surface now.
    try {
      const issues = validateArticle(filePath)
      if (issues.length === 0) {
        ok("lint clean")
      } else {
        for (const issue of issues) {
          process.stderr.write(`  ${pc.yellow("⚠")} ${issue.message}\n`)
        }
      }
    } catch {
      // File just written; validator errors here would be exceptional.
    }

    nextSteps({
      commands: [
        "helpbase dev",
        `$EDITOR ${path.relative(process.cwd(), filePath)}`,
      ],
    })
  })

async function pickTemplate(): Promise<Template> {
  const choice = await select({
    message: "Which template?",
    options: VALID_TYPES.map((id) => ({
      value: id,
      label: TEMPLATES[id]!.label,
      hint: TEMPLATES[id]!.description,
    })),
  })
  if (isCancel(choice)) {
    cancel("Cancelled.")
    process.exit(0)
  }
  return TEMPLATES[choice as string]!
}

async function pickCategory(contentDir: string, template: Template): Promise<string> {
  const existing = fs.existsSync(contentDir)
    ? fs
        .readdirSync(contentDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : []

  // Default category always available; if it's not already on disk, offer it
  // as the top choice so the template "just works" in a fresh project.
  const categorySet = new Set(existing)
  categorySet.add(template.defaultCategory)
  const categories = Array.from(categorySet)

  const choice = await select({
    message: "Which category?",
    options: [
      ...categories.map((c) => ({
        value: c,
        label: c,
        hint: c === template.defaultCategory ? "default for this template" : undefined,
      })),
      { value: "__new__", label: pc.cyan("+ Create new category") },
    ],
    initialValue: template.defaultCategory,
  })

  if (isCancel(choice)) {
    cancel("Cancelled.")
    process.exit(0)
  }

  if (choice === "__new__") {
    const name = await text({
      message: "Category name?",
      placeholder: "Getting Started",
      validate: (v) => (v ? undefined : "Category name is required"),
    })
    if (isCancel(name)) {
      cancel("Cancelled.")
      process.exit(0)
    }
    return slugify(name as string)
  }

  return choice as string
}

async function promptTitle(template: Template): Promise<string> {
  const value = await text({
    message: "Article title?",
    placeholder: template.defaultTitle,
    validate: (v) => (v ? undefined : "Title is required"),
  })
  if (isCancel(value)) {
    cancel("Cancelled.")
    process.exit(0)
  }
  return value as string
}

async function promptDescription(): Promise<string> {
  const value = await text({
    message: "Brief description? (optional)",
    placeholder: "A short summary shown in search results and previews",
  })
  if (isCancel(value)) {
    cancel("Cancelled.")
    process.exit(0)
  }
  return (value as string) || ""
}
