import { describe, it, expect, afterEach } from "vitest"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { execSync } from "node:child_process"

const CLI = path.resolve(__dirname, "../dist/index.js")

// Run the CLI in a temp dir with stdin detached so process.stdin.isTTY is
// undefined (simulates CI/pipe execution). Returns both exit code and output.
function runNonInteractive(
  args: string,
  cwd: string,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      encoding: "utf-8",
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    })
    return { stdout, stderr: "", exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: err.status ?? 1,
    }
  }
}

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "create-helpbase-test-"))
}

describe("create-helpbase CLI integration", () => {
  it("prints help text with all options", () => {
    const output = execSync(`node ${CLI} --help`, { encoding: "utf-8" })
    expect(output).toContain("Create a beautiful, AI-powered help center")
    expect(output).toContain("--url")
    expect(output).toContain("--no-install")
    expect(output).toContain("--no-open")
    expect(output).toContain("--deploy")
    expect(output).toContain("--no-deploy")
  })

  it("prints version from package.json (not a hardcoded string)", () => {
    const output = execSync(`node ${CLI} --version`, { encoding: "utf-8" }).trim()
    // Semver-ish check: at minimum MAJOR.MINOR.PATCH with digits. Guards
    // against the pre-0.4.0 bug where the CLI's `.version()` literal
    // drifted from package.json every release.
    expect(output).toMatch(/^\d+\.\d+\.\d+/)
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf-8"),
    ) as { version: string }
    expect(output).toBe(pkg.version)
  })

  it("help text mentions directory argument", () => {
    const output = execSync(`node ${CLI} --help`, { encoding: "utf-8" })
    expect(output).toContain("directory")
  })
})

// Regression: QA found three issues with create-helpbase running in
// scripted/non-interactive contexts. /qa on 2026-04-09 caught them all.
// Report: .gstack/qa-reports/qa-report-helpbase-cli-2026-04-09.md
describe("create-helpbase non-interactive mode (regression)", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  // Regression: ISSUE-002 — create-helpbase <dir> with non-TTY stdin used
  // to hang on the URL prompt, exit 0, and create nothing. Now it should
  // detect non-TTY, skip the prompt, and scaffold with sample content.
  it("ISSUE-002: non-TTY + directory arg scaffolds with sample content", () => {
    const tmp = mkTempDir()
    tempDirs.push(tmp)

    const { exitCode } = runNonInteractive(
      "my-app --no-install --no-open",
      tmp,
    )
    expect(exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmp, "my-app"))).toBe(true)
    expect(fs.existsSync(path.join(tmp, "my-app", "content"))).toBe(true)
    expect(
      fs.existsSync(path.join(tmp, "my-app", "package.json")),
    ).toBe(true)
  })

  // Non-interactive runs must not write an .env.local from the AI-key
  // prompt — that prompt only runs in TTY mode, and scripted/CI runs
  // should stay untouched so they can inject the key themselves.
  it("non-interactive scaffold does not create .env.local", () => {
    const tmp = mkTempDir()
    tempDirs.push(tmp)

    const { exitCode } = runNonInteractive(
      "my-app --no-install --no-open",
      tmp,
    )
    expect(exitCode).toBe(0)
    const envPath = path.join(tmp, "my-app", ".env.local")
    expect(fs.existsSync(envPath)).toBe(false)
  })

  // Regression: ISSUE-002 edge case — non-TTY with no directory arg should
  // error with exit 1 (can't prompt for project name non-interactively).
  it("ISSUE-002: non-TTY without directory arg exits 1", () => {
    const tmp = mkTempDir()
    tempDirs.push(tmp)

    const { exitCode, stdout } = runNonInteractive("--no-install --no-open", tmp)
    expect(exitCode).toBe(1)
    expect(stdout).toContain("non-interactively")
  })

  // Regression: ensure the happy path still works — valid name passed as
  // CLI arg in non-interactive mode should scaffold successfully.
  it("ISSUE-002: valid kebab-case names scaffold successfully", () => {
    const tmp = mkTempDir()
    tempDirs.push(tmp)

    const { exitCode } = runNonInteractive(
      "my-valid-app-123 --no-install --no-open",
      tmp,
    )
    expect(exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmp, "my-valid-app-123"))).toBe(true)
  })

  // Regression: ISSUE-003 — invalid project names passed as CLI args used to
  // skip validation (the validator only ran in the interactive prompt path).
  // Now the same regex runs against CLI-provided directory arguments.
  it("ISSUE-003: invalid project name via CLI arg exits 1", () => {
    const tmp = mkTempDir()
    tempDirs.push(tmp)

    const { exitCode, stdout } = runNonInteractive(
      `"Bad Name" --no-install --no-open`,
      tmp,
    )
    expect(exitCode).toBe(1)
    expect(stdout).toContain("lowercase letters, numbers, and hyphens")
    expect(fs.existsSync(path.join(tmp, "Bad Name"))).toBe(false)
  })

  it("ISSUE-003: uppercase project name via CLI arg exits 1", () => {
    const tmp = mkTempDir()
    tempDirs.push(tmp)

    const { exitCode } = runNonInteractive(
      "MyApp --no-install --no-open",
      tmp,
    )
    expect(exitCode).toBe(1)
    expect(fs.existsSync(path.join(tmp, "MyApp"))).toBe(false)
  })

  it("ISSUE-003: underscore project name via CLI arg exits 1", () => {
    const tmp = mkTempDir()
    tempDirs.push(tmp)

    const { exitCode } = runNonInteractive(
      "my_app --no-install --no-open",
      tmp,
    )
    expect(exitCode).toBe(1)
  })
})
