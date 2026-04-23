import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"

const CLI = path.resolve(__dirname, "../dist/index.js")
const PKG_VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"),
).version as string

function exec(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    return { stdout, stderr: "", exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    }
  }
}

describe("helpbase CLI integration", () => {
  describe("--help and --version", () => {
    it("prints help with all commands listed", () => {
      const { stdout } = exec("--help")
      expect(stdout).toContain("dev")
      expect(stdout).toContain("generate")
      expect(stdout).toContain("audit")
      expect(stdout).toContain("new")
      expect(stdout).toContain("init")
      expect(stdout).toContain("deploy")
      expect(stdout).toContain("login")
      expect(stdout).toContain("logout")
      expect(stdout).toContain("whoami")
      expect(stdout).toContain("link")
      expect(stdout).toContain("open")
      expect(stdout).toContain("feedback")
      expect(stdout).toContain("doctor")
    })

    it("prints version", () => {
      const { stdout } = exec("--version")
      expect(stdout.trim()).toBe(PKG_VERSION)
    })

    it("each subcommand has help text", () => {
      for (const cmd of [
        "dev", "generate", "context", "sync", "mcp", "audit", "new", "init", "deploy",
        "login", "logout", "whoami", "link", "open", "feedback", "doctor",
      ]) {
        const { stdout } = exec(`${cmd} --help`)
        expect(stdout.length).toBeGreaterThan(20)
      }
    }, 30_000)
  })

  describe("generate error handling", () => {
    it("exits 1 when no source is provided", () => {
      const result = exec("generate")
      expect(result.exitCode).toBe(1)
    })

    it("error output tells the user what to do", () => {
      const result = exec("generate")
      const output = result.stdout + result.stderr
      expect(output).toContain("--url")
      expect(output).toContain("--repo")
    })

    it("exits 1 for unreachable URL", () => {
      const result = exec("generate --url http://localhost:99999")
      expect(result.exitCode).toBe(1)
    })

    it("error for bad URL follows problem/cause/fix pattern", () => {
      const result = exec("generate --url http://localhost:99999")
      const output = result.stdout + result.stderr
      expect(output).toContain("Reason:")
      expect(output).toContain("Fix:")
      expect(output).toContain("Docs:")
    })
  })

  describe("audit integration", () => {
    it("exits 0 on valid content directory", () => {
      const contentDir = path.resolve(__dirname, "../../../apps/web/content")
      const result = exec(`audit --dir ${contentDir}`)
      expect(result.exitCode).toBe(0)
    })

    it("exits 1 on nonexistent directory", () => {
      const result = exec("audit --dir /tmp/helpbase-nonexistent-dir-12345")
      expect(result.exitCode).toBe(1)
    })
  })

  describe("sync empty-diff handling (E_NO_HISTORY)", () => {
    // Regression guard for helpbase@0.8.1 hotfix. Before the fix, sync
    // throw E_NO_HISTORY + exit 1 whenever `git diff <since> HEAD` was
    // empty. That failed every scheduled helpbase-workflow CI run and
    // every push-to-main that happened to equal origin/main. The fix:
    // under --yes (non-interactive / CI), exit 0 with a friendly note
    // instead of erroring. Interactive users still see the full error.

    function setupEmptyGitRepo(): string {
      const dir = fs.mkdtempSync(
        path.join(require("node:os").tmpdir(), "helpbase-sync-emptydiff-"),
      )
      execSync("git init --initial-branch=main", { cwd: dir, stdio: "ignore" })
      execSync("git config user.email test@example.com", { cwd: dir, stdio: "ignore" })
      execSync("git config user.name test", { cwd: dir, stdio: "ignore" })
      fs.writeFileSync(path.join(dir, "seed.txt"), "seed")
      execSync("git add . && git commit -m seed", { cwd: dir, stdio: "ignore" })
      return dir
    }

    it("exits 0 with a friendly note when --yes is set and the diff is empty", () => {
      const dir = setupEmptyGitRepo()
      try {
        const result = execSync(
          `node ${CLI} sync --since HEAD --yes --content /tmp/nonexistent`,
          { cwd: dir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
        )
        expect(result).toContain("No code changes since HEAD")
        expect(result).toContain("nothing to sync")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it("exits 1 with the full E_NO_HISTORY error in interactive mode", () => {
      const dir = setupEmptyGitRepo()
      try {
        let exitCode = 0
        let stdout = ""
        let stderr = ""
        try {
          execSync(`node ${CLI} sync --since HEAD`, {
            cwd: dir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          })
        } catch (err) {
          const e = err as NodeJS.ErrnoException & {
            status?: number
            stdout?: string
            stderr?: string
          }
          exitCode = e.status ?? 1
          stdout = e.stdout ?? ""
          stderr = e.stderr ?? ""
        }
        expect(exitCode).toBe(1)
        const output = stdout + stderr
        expect(output).toContain("E_NO_HISTORY")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it("exits 0 under --yes when --since points at an unresolvable rev (0.8.2 fix)", () => {
      // Regression: GitHub Actions on a first-ever push passes a 40-zero SHA
      // as --since (github.event.before), which git can't resolve ("bad
      // object"). Before 0.8.2, this threw E_INVALID_REV + exit 1, failing
      // every brand-new repo's first Action run. The fix: under --yes,
      // treat an unresolvable rev the same as an empty diff — print a
      // friendly note and exit 0.
      const dir = setupEmptyGitRepo()
      try {
        const zeros = "0000000000000000000000000000000000000000"
        const result = execSync(
          `node ${CLI} sync --since ${zeros} --yes --content /tmp/nonexistent`,
          { cwd: dir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
        )
        expect(result).toContain(`Git could not resolve '${zeros}'`)
        expect(result).toContain("nothing to sync")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it("exits 1 with E_INVALID_REV in interactive mode on unresolvable rev", () => {
      const dir = setupEmptyGitRepo()
      try {
        let exitCode = 0
        let output = ""
        try {
          execSync(`node ${CLI} sync --since HEAD~99`, {
            cwd: dir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          })
        } catch (err) {
          const e = err as NodeJS.ErrnoException & {
            status?: number
            stdout?: string
            stderr?: string
          }
          exitCode = e.status ?? 1
          output = (e.stdout ?? "") + (e.stderr ?? "")
        }
        expect(exitCode).toBe(1)
        expect(output).toContain("E_INVALID_REV")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})
