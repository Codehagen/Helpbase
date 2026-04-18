import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function run(args: string): string {
  return execSync(`node ${CLI_PATH} ${args}`, { encoding: "utf-8" })
}

function runNoColor(args: string): string {
  return execSync(`node ${CLI_PATH} ${args}`, {
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1" },
  })
}

describe("helpbase --help", () => {
  it("shows the main help text", () => {
    const output = run("--help")
    expect(output).toContain("CLI for managing your Helpbase help center")
    expect(output).toContain("dev")
    expect(output).toContain("generate")
    expect(output).toContain("audit")
    expect(output).toContain("new")
  })

  it("groups commands into named sections", () => {
    const output = runNoColor("--help")
    expect(output).toContain("Most common:")
    expect(output).toContain("Get started")
    expect(output).toContain("Ship")
    expect(output).toContain("Author")
    expect(output).toContain("Account")
    expect(output).toContain("Diagnose")
  })

  it("surfaces the three canonical commands up top (ingest leads — flagship AI-native flow)", () => {
    const output = runNoColor("--help")
    expect(output).toMatch(/Most common:[\s\S]*helpbase ingest/)
    expect(output).toMatch(/Most common:[\s\S]*helpbase new/)
    expect(output).toMatch(/Most common:[\s\S]*helpbase dev/)
  })

  it("lists ingest under Get started (deprecated context falls into Other)", () => {
    const output = runNoColor("--help")
    // Extract the "Get started" block — anchor to the next group heading
    // ("Ship") so a future group reorder can't make the regex swallow the
    // Other section and flake the assertion below.
    const getStartedMatch = output.match(/Get started\s*\n([\s\S]*?)\n\s*Ship/)
    const getStarted = getStartedMatch?.[1] ?? ""
    expect(getStarted).toContain("ingest")
    // context still registered (deprecation shim) but NOT in the curated groups.
    expect(getStarted).not.toContain("context")
  })

  it("lists deprecated context under Other so users still discover it", () => {
    const output = runNoColor("--help")
    // Other is the auto-generated group for any command not in GROUPS.
    // Anchored between "Other" and the closing "Run `helpbase" help text
    // so a future group addition doesn't break the capture.
    const otherMatch = output.match(/Other\s*\n([\s\S]*?)\n\s*Run /)
    const other = otherMatch?.[1] ?? ""
    expect(other).toContain("context")
    expect(other).toContain("deprecated")
  })

  it("advertises --json and --quiet as global options", () => {
    const output = runNoColor("--help")
    expect(output).toContain("--json")
    expect(output).toContain("--quiet")
  })

  it("shows version", () => {
    const output = run("--version")
    // Read the expected version from package.json so this test doesn't
    // drift on every release. What matters is --version matches the
    // package, not that it matches a specific string.
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"),
    )
    expect(output.trim()).toBe(pkg.version)
  })

  it("shows dev subcommand help", () => {
    const output = run("dev --help")
    expect(output).toContain("Start the development server")
    expect(output).toContain("--port")
  })

  it("shows generate subcommand help", () => {
    const output = run("generate --help")
    expect(output).toContain("Generate help articles using AI")
    expect(output).toContain("--url")
    expect(output).toContain("--repo")
  })

  it("shows audit subcommand help", () => {
    const output = run("audit --help")
    expect(output).toContain("Check content health")
    expect(output).toContain("--dir")
  })

  it("shows new subcommand help", () => {
    const output = run("new --help")
    expect(output).toContain("Create a new article from a template")
    expect(output).toContain("--type")
  })
})
