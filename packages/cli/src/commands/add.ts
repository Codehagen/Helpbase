import { Command } from "commander"
import { text, select, isCancel, cancel } from "@clack/prompts"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"

export const addCommand = new Command("add")
  .description("Add a new article or category interactively")
  .option("-d, --dir <dir>", "Content directory", "content")
  .action(async (opts) => {
    const contentDir = path.resolve(process.cwd(), opts.dir)

    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true })
    }

    // Get existing categories
    const categories = fs
      .readdirSync(contentDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    // Select or create category
    const categoryOptions = [
      ...categories.map((c) => ({ value: c, label: c })),
      { value: "__new__", label: pc.cyan("+ Create new category") },
    ]

    const category = await select({
      message: "Which category?",
      options: categoryOptions,
    })

    if (isCancel(category)) {
      cancel("Cancelled.")
      process.exit(0)
    }

    let categorySlug = category as string

    if (categorySlug === "__new__") {
      const name = await text({
        message: "Category name?",
        placeholder: "Getting Started",
        validate(value) {
          if (!value) return "Category name is required"
        },
      })

      if (isCancel(name)) {
        cancel("Cancelled.")
        process.exit(0)
      }

      categorySlug = slugify(name as string)
      const categoryDir = path.join(contentDir, categorySlug)
      fs.mkdirSync(categoryDir, { recursive: true })

      fs.writeFileSync(
        path.join(categoryDir, "_category.json"),
        JSON.stringify(
          {
            title: name as string,
            description: "",
            order: categories.length + 1,
          },
          null,
          2
        )
      )

      console.log(`  ${pc.green("+")} Created category: ${categorySlug}/`)
    }

    // Article title
    const title = await text({
      message: "Article title?",
      placeholder: "How to get started",
      validate(value) {
        if (!value) return "Title is required"
      },
    })

    if (isCancel(title)) {
      cancel("Cancelled.")
      process.exit(0)
    }

    const description = await text({
      message: "Brief description?",
      placeholder: "A quick guide to getting started with our product",
    })

    if (isCancel(description)) {
      cancel("Cancelled.")
      process.exit(0)
    }

    const slug = slugify(title as string)
    const filePath = path.join(contentDir, categorySlug, `${slug}.mdx`)

    if (fs.existsSync(filePath)) {
      console.error(`${pc.red("✖")} Article already exists: ${filePath}`)
      process.exit(1)
    }

    const content = `---
schemaVersion: 1
title: "${title as string}"
description: "${(description as string) || ""}"
tags: []
order: 1
featured: false
---

# ${title as string}

Write your article content here.
`

    fs.writeFileSync(filePath, content)
    console.log(`\n  ${pc.green("+")} Created: ${categorySlug}/${slug}.mdx\n`)
  })

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
