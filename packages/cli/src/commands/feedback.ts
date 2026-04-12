import { Command } from "commander"
import { execSync } from "node:child_process"
import os from "node:os"
import pc from "picocolors"

const ISSUES_BASE = "https://github.com/Codehagen/helpbase/issues/new"

export const feedbackCommand = new Command("feedback")
  .description("Open a prefilled GitHub issue with your environment info")
  .option("--print", "Print the URL instead of opening the browser")
  .option(
    "-t, --title <title>",
    "Issue title to prefill",
    "Bug in helpbase CLI",
  )
  .action((opts: { print?: boolean; title?: string }) => {
    const version = readCliVersion()
    const body = [
      `**helpbase version:** ${version}`,
      `**Node:** ${process.version}`,
      `**Platform:** ${process.platform} (${process.arch}), ${os.release()}`,
      "",
      "## What happened",
      "",
      "_Describe what you expected and what actually happened._",
      "",
      "## How to reproduce",
      "",
      "1. ",
      "2. ",
      "3. ",
      "",
      "## Error output (if any)",
      "",
      "```",
      "paste here",
      "```",
    ].join("\n")

    const params = new URLSearchParams({
      template: "bug_report.yml",
      title: opts.title ?? "",
      version,
      platform: `${process.platform} ${os.release()}, Node ${process.version}`,
      "what-happened": body,
    })

    const url = `${ISSUES_BASE}?${params.toString()}`

    if (opts.print) {
      console.log(url)
      return
    }

    const cmd = platformOpener(url)
    if (!cmd) {
      console.log(url)
      console.log(
        `${pc.dim("›")} Unrecognized platform; printed the URL instead.`,
      )
      return
    }

    try {
      execSync(cmd, { stdio: "ignore" })
      console.log(`${pc.green("✓")} Opened GitHub issue form.`)
      console.log(`  ${pc.dim("If the browser didn't launch, here's the URL:")}`)
      console.log(`  ${pc.dim(url)}`)
    } catch {
      console.log(url)
      console.log(
        `${pc.dim("›")} Couldn't launch browser; printed the URL instead.`,
      )
    }
  })

function readCliVersion(): string {
  try {
    const pkg = JSON.parse(
      execSync("npm ls helpbase --global --json 2>/dev/null", {
        encoding: "utf-8",
      }) || "{}",
    )
    if (pkg?.dependencies?.helpbase?.version) {
      return pkg.dependencies.helpbase.version as string
    }
  } catch {
    // fall through
  }
  return "unknown"
}

function platformOpener(url: string): string | null {
  const quoted = `"${url.replace(/"/g, '\\"')}"`
  switch (process.platform) {
    case "darwin":
      return `open ${quoted}`
    case "win32":
      return `start "" ${quoted}`
    case "linux":
      return `xdg-open ${quoted}`
    default:
      return null
  }
}
