import { describe, it, expect } from "vitest"
import path from "node:path"
import { execSync } from "node:child_process"
import { Command } from "commander"
import { extractTree } from "../src/lib/completion/tree.js"
import { bashScript } from "../src/lib/completion/bash.js"
import { zshScript } from "../src/lib/completion/zsh.js"
import { fishScript } from "../src/lib/completion/fish.js"
import { powershellScript } from "../src/lib/completion/powershell.js"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function run(args: string, opts: { allowFail?: boolean } = {}): string {
  try {
    return execSync(`node ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    })
  } catch (e) {
    if (opts.allowFail) {
      const err = e as { stdout?: Buffer; stderr?: Buffer }
      return (err.stdout?.toString() ?? "") + (err.stderr?.toString() ?? "")
    }
    throw e
  }
}

// ─── Tree extractor ──────────────────────────────────────────────

function fixtureProgram(): Command {
  const program = new Command()
    .name("mytool")
    .description("test")
    .option("--json", "emit JSON")
    .option("--quiet", "suppress decoration")

  program
    .command("new")
    .description("Create a thing")
    .option("-t, --type <type>", "template type")
    .option("--dir <dir>", "target directory")

  program
    .command("deploy")
    .description("Ship it")
    .option("--slug <slug>", "tenant slug")

  return program
}

describe("completion tree extractor", () => {
  it("captures subcommand names + descriptions", () => {
    const tree = extractTree(fixtureProgram())
    expect(tree.name).toBe("mytool")
    expect(tree.subcommands.map((c) => c.name)).toEqual(["new", "deploy"])
    expect(tree.subcommands[0]!.description).toBe("Create a thing")
  })

  it("extracts long flags only, with descriptions", () => {
    const tree = extractTree(fixtureProgram())
    const newCmd = tree.subcommands.find((c) => c.name === "new")!
    const flagNames = newCmd.flags.map((f) => f.flag)
    expect(flagNames).toContain("--type")
    expect(flagNames).toContain("--dir")
    expect(flagNames).toContain("--help")
    // No short flags.
    expect(flagNames).not.toContain("-t")
  })

  it("includes global flags separately", () => {
    const tree = extractTree(fixtureProgram())
    const globals = tree.globalFlags.map((f) => f.flag)
    expect(globals).toContain("--json")
    expect(globals).toContain("--quiet")
  })
})

// ─── Per-shell generators ────────────────────────────────────────

describe("bash generator", () => {
  it("emits a complete -F registration with per-subcommand flag cases", () => {
    const script = bashScript(extractTree(fixtureProgram()))
    expect(script).toContain("complete -F _mytool_completion mytool")
    expect(script).toContain("new)")
    expect(script).toContain("deploy)")
    expect(script).toContain("--type")
    expect(script).toContain("--slug")
  })
})

describe("zsh generator", () => {
  it("emits a compdef with _describe block", () => {
    const script = zshScript(extractTree(fixtureProgram()))
    expect(script).toContain("#compdef mytool")
    expect(script).toContain("_mytool() {")
    expect(script).toContain("_describe -t commands 'mytool command' subcmds")
    expect(script).toContain("'new:Create a thing'")
  })

  it("escapes zsh-special chars in descriptions", () => {
    const program = new Command().name("x")
    program.command("foo").description("Has: colons and [brackets] and 'quotes'")
    const script = zshScript(extractTree(program))
    // Colons in descriptions must be escaped to survive _describe syntax.
    expect(script).toContain("Has\\:")
    expect(script).toContain("\\[brackets\\]")
  })
})

describe("fish generator", () => {
  it("emits complete directives per subcommand and flag", () => {
    const script = fishScript(extractTree(fixtureProgram()))
    expect(script).toContain("complete -c mytool -f")
    expect(script).toContain("-a 'new'")
    expect(script).toContain("-a 'deploy'")
    expect(script).toContain("__fish_seen_subcommand_from new")
    expect(script).toContain("-l type")
  })
})

describe("powershell generator", () => {
  it("emits Register-ArgumentCompleter with a native scriptblock", () => {
    const script = powershellScript(extractTree(fixtureProgram()))
    expect(script).toContain("Register-ArgumentCompleter -Native -CommandName mytool")
    expect(script).toContain("'new'")
    expect(script).toContain("'deploy'")
    expect(script).toContain("CompletionResult")
  })
})

// ─── E2E via CLI ─────────────────────────────────────────────────

describe("helpbase completion <shell>", () => {
  it("emits a non-empty bash script", () => {
    const out = run("completion bash")
    expect(out).toContain("complete -F")
    expect(out).toContain("helpbase")
    // Real subcommand names should appear.
    expect(out).toContain("deploy")
    expect(out).toContain("generate")
  })

  it("emits a non-empty zsh script with compdef directive", () => {
    const out = run("completion zsh")
    expect(out).toContain("#compdef helpbase")
    expect(out).toContain("_helpbase")
  })

  it("emits a non-empty fish script", () => {
    const out = run("completion fish")
    expect(out).toContain("complete -c helpbase")
  })

  it("emits a non-empty powershell script", () => {
    const out = run("completion powershell")
    expect(out).toContain("Register-ArgumentCompleter")
  })

  it("fails with structured error on unknown shell", () => {
    const combined = run("completion tcsh", { allowFail: true })
    expect(combined).toMatch(/Unsupported shell|E_MISSING_FLAG/)
  })
})
