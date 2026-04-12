import { describe, it, expect } from "vitest"
import path from "node:path"
import { execSync } from "node:child_process"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function run(args: string): string {
  return execSync(`node ${CLI_PATH} ${args}`, { encoding: "utf-8" })
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
