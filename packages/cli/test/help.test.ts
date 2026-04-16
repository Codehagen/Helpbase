import { describe, it, expect } from "vitest"
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

  it("surfaces the three canonical commands up top (context leads — flagship AI-native flow)", () => {
    const output = runNoColor("--help")
    expect(output).toMatch(/Most common:[\s\S]*helpbase context/)
    expect(output).toMatch(/Most common:[\s\S]*helpbase new/)
    expect(output).toMatch(/Most common:[\s\S]*helpbase dev/)
  })

  it("lists context under Get started, not Other", () => {
    const output = runNoColor("--help")
    // Extract the "Get started" block — ends at the next group heading
    // ("Ship") or EOL.
    const getStarted = output.match(/Get started[\s\S]*?(?=Ship|$)/)?.[0] ?? ""
    expect(getStarted).toContain("context")
  })

  it("advertises --json and --quiet as global options", () => {
    const output = runNoColor("--help")
    expect(output).toContain("--json")
    expect(output).toContain("--quiet")
  })

  it("shows version", () => {
    const output = run("--version")
    expect(output.trim()).toBe("0.0.1")
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
