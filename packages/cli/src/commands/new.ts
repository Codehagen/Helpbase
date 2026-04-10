import { Command } from "commander"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"

const TEMPLATES: Record<string, { label: string; body: string }> = {
  troubleshooting: {
    label: "Troubleshooting",
    body: `## Overview

Describe the problem your users are experiencing and what they should expect after following these steps.

## Diagnosis

<Callout type="warning">Before proceeding, make sure you have saved any unsaved work.</Callout>

Check for the most common causes first:

1. Verify your configuration is correct
2. Check the error logs for specific messages
3. Confirm your environment meets the requirements

## Solution

<Steps>
  <Step title="Identify the error">
    Look for the specific error message in your logs or console output. Note down the exact wording — this helps narrow the root cause.
  </Step>
  <Step title="Apply the fix">
    Based on the error message, apply the appropriate fix from the table below. If your error is not listed, check the related articles at the bottom of this page.
  </Step>
  <Step title="Verify the fix">
    After applying the fix, restart your application and confirm the issue is resolved. If the problem persists, try the alternative approaches below.
  </Step>
</Steps>

## Alternative Approaches

<Callout type="tip">If the main solution did not work, these alternatives may help with edge cases.</Callout>

Describe any fallback approaches or workarounds here.

## Related Articles

<CardGroup cols={2}>
  <Card icon="book-open" title="Getting Started" href="/getting-started/introduction">Review the basics if you are new to the product.</Card>
  <Card icon="settings" title="Configuration" href="/getting-started/configuration">Check your configuration settings for common issues.</Card>
</CardGroup>
`,
  },
}

export const VALID_TYPES = Object.keys(TEMPLATES)

export const newCommand = new Command("new")
  .description("Create a new article from a template")
  .requiredOption("-t, --type <type>", `Template type: ${VALID_TYPES.join(", ")}`)
  .option("-d, --dir <dir>", "Content directory", "content")
  .option("-c, --category <category>", "Category slug", "troubleshooting")
  .option("--title <title>", "Article title")
  .option("--slug <slug>", "Article slug (derived from title if omitted)")
  .action((opts) => {
    if (!TEMPLATES[opts.type]) {
      console.error(
        `${pc.red("✖")} Unknown template type "${opts.type}"\n` +
          `  Valid types: ${VALID_TYPES.join(", ")}\n`,
      )
      process.exit(1)
    }

    const template = TEMPLATES[opts.type]!
    const contentDir = path.resolve(process.cwd(), opts.dir)
    const categorySlug = opts.category
    const title = opts.title || `${template.label} Guide`
    const slug =
      opts.slug ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")

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

    const mdx = `---
schemaVersion: 1
title: "${title}"
description: ""
tags: []
order: 1
featured: false
---

${template.body}`

    fs.writeFileSync(filePath, mdx)

    // Create asset directory
    const assetDir = path.join(categoryDir, slug)
    fs.mkdirSync(assetDir, { recursive: true })

    console.log(`\n  ${pc.green("+")} Created: ${categorySlug}/${slug}.mdx`)
    console.log(`  ${pc.green("+")} Created: ${categorySlug}/${slug}/ (asset directory)`)
    console.log()
  })
