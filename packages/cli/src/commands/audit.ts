import { Command } from "commander"
import pc from "picocolors"
import path from "node:path"
import { auditContent, AuditError } from "../audit.js"

export const auditCommand = new Command("audit")
  .description("Check content health: missing fields, broken links, schema errors")
  .option("-d, --dir <dir>", "Content directory to audit", "content")
  .action((opts) => {
    const contentDir = path.resolve(process.cwd(), opts.dir)

    try {
      const result = auditContent(contentDir)

      console.log()
      console.log(pc.bold("Helpbase Content Audit"))
      console.log(pc.dim("─".repeat(40)))
      console.log(`  Categories: ${pc.bold(String(result.categoryCount))}`)
      console.log(`  Articles:   ${pc.bold(String(result.articleCount))}`)
      console.log()

      if (result.issues.length === 0) {
        console.log(`${pc.green("✓")} All content is healthy!\n`)
      } else {
        console.log(
          `Found ${pc.bold(String(result.issues.length))} issue${result.issues.length === 1 ? "" : "s"}:\n`
        )
        for (const issue of result.issues) {
          const icon = issue.level === "error" ? pc.red("✖") : pc.yellow("⚠")
          console.log(`  ${icon} ${issue.file}: ${issue.message}`)
        }
        console.log()
        process.exit(1)
      }
    } catch (err) {
      if (err instanceof AuditError) {
        console.error(
          `${pc.red("✖")} ${err.message}\n` +
            `  Fix: Run this from your project root, or use ${pc.cyan("--dir <path>")}\n`
        )
        process.exit(1)
      }
      throw err
    }
  })
