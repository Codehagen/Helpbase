import { afterEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { findSkillsDir, loadSkills } from "../src/content/skills.js"
import { handleListSkills } from "../src/tools/list-skills.js"
import { handleGetSkill } from "../src/tools/get-skill.js"

/**
 * Fixture builder. Creates a tempdir with an arbitrary set of
 * `.helpbase/skills/<name>.md` files and optional unrelated noise.
 * Returns the absolute skills-dir path for loadSkills().
 */
function makeSkillsFixture(
  files: Record<string, string>,
  extraFiles: Record<string, string> = {},
): { skillsDir: string; repoRoot: string; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-skills-"))
  const skillsDir = path.join(repoRoot, ".helpbase", "skills")
  fs.mkdirSync(skillsDir, { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(skillsDir, name), body, "utf-8")
  }
  for (const [rel, body] of Object.entries(extraFiles)) {
    const full = path.join(repoRoot, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body, "utf-8")
  }
  return {
    skillsDir,
    repoRoot,
    cleanup: () => fs.rmSync(repoRoot, { recursive: true, force: true }),
  }
}

const ORIGINAL_ENV = process.env.HELPBASE_SKILLS_DIR

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.HELPBASE_SKILLS_DIR
  else process.env.HELPBASE_SKILLS_DIR = ORIGINAL_ENV
})

describe("findSkillsDir", () => {
  it("returns null when no .helpbase/skills/ directory exists anywhere up the tree", () => {
    const { repoRoot, cleanup } = makeSkillsFixture({})
    // Delete the skills dir we just made so we walk all the way up.
    fs.rmSync(path.join(repoRoot, ".helpbase"), { recursive: true })
    try {
      expect(findSkillsDir(repoRoot)).toBeNull()
    } finally {
      cleanup()
    }
  })

  it("walks up from cwd and finds .helpbase/skills/", () => {
    const { skillsDir, repoRoot, cleanup } = makeSkillsFixture({
      "voice.md": "---\n---\nbody",
    })
    try {
      // Start from a nested subdir inside the repo to prove walk-up works.
      const deep = path.join(repoRoot, "packages", "foo", "src")
      fs.mkdirSync(deep, { recursive: true })
      expect(findSkillsDir(deep)).toBe(skillsDir)
    } finally {
      cleanup()
    }
  })

  it("honors HELPBASE_SKILLS_DIR when set", () => {
    const { skillsDir, cleanup } = makeSkillsFixture({ "v.md": "body" })
    try {
      process.env.HELPBASE_SKILLS_DIR = skillsDir
      expect(findSkillsDir("/tmp")).toBe(skillsDir)
    } finally {
      cleanup()
    }
  })

  it("throws when HELPBASE_SKILLS_DIR points nowhere", () => {
    process.env.HELPBASE_SKILLS_DIR = "/nonexistent/path/helpbase-skills-test"
    expect(() => findSkillsDir()).toThrow(/does not exist/)
  })
})

describe("loadSkills", () => {
  it("returns empty array when skillsDir is null", () => {
    expect(loadSkills(null)).toEqual([])
  })

  it("returns empty array when skillsDir does not exist", () => {
    expect(loadSkills("/tmp/definitely-not-a-real-skills-dir-xyz")).toEqual([])
  })

  it("loads skills with frontmatter description", () => {
    const { skillsDir, cleanup } = makeSkillsFixture({
      "voice.md": "---\ndescription: Tone + voice\n---\nWrite active.",
      "api.md": "---\ndescription: API reference style\n---\nUse backticks for params.",
    })
    try {
      const skills = loadSkills(skillsDir)
      expect(skills).toHaveLength(2)
      // Sorted alphabetically
      expect(skills[0]?.name).toBe("api")
      expect(skills[0]?.description).toBe("API reference style")
      expect(skills[0]?.content).toBe("Use backticks for params.")
      expect(skills[1]?.name).toBe("voice")
      expect(skills[1]?.description).toBe("Tone + voice")
    } finally {
      cleanup()
    }
  })

  it("treats description as empty string when absent", () => {
    const { skillsDir, cleanup } = makeSkillsFixture({
      "no-frontmatter.md": "Just body, no frontmatter at all.",
      "empty-frontmatter.md": "---\n---\nBody.",
    })
    try {
      const skills = loadSkills(skillsDir)
      expect(skills[0]?.description).toBe("")
      expect(skills[1]?.description).toBe("")
    } finally {
      cleanup()
    }
  })

  it("skips files prefixed with underscore (drafts)", () => {
    const { skillsDir, cleanup } = makeSkillsFixture({
      "voice.md": "---\n---\npublished",
      "_wip-voice.md": "---\n---\ndraft",
    })
    try {
      const skills = loadSkills(skillsDir)
      expect(skills.map((s) => s.name)).toEqual(["voice"])
    } finally {
      cleanup()
    }
  })

  it("ignores non-markdown files", () => {
    const { skillsDir, cleanup } = makeSkillsFixture({
      "voice.md": "---\n---\nmd",
      "notes.txt": "not a skill",
      "config.json": "{}",
    })
    try {
      const skills = loadSkills(skillsDir)
      expect(skills.map((s) => s.name)).toEqual(["voice"])
    } finally {
      cleanup()
    }
  })

  it("skips a single malformed file with a stderr warning, keeps others loading", () => {
    const { skillsDir, cleanup } = makeSkillsFixture({
      "ok.md": "---\ndescription: ok\n---\nbody",
      "bad.md": "---\ndescription: [unclosed bracket\n---\nbody",
    })
    const origStderr = process.stderr.write.bind(process.stderr)
    const captured: string[] = []
    ;(process.stderr as unknown as { write: (s: string) => boolean }).write = (
      c: string,
    ) => {
      captured.push(String(c))
      return true
    }
    try {
      const skills = loadSkills(skillsDir)
      expect(skills.map((s) => s.name)).toEqual(["ok"])
      expect(captured.join("")).toMatch(/bad\.md/)
      expect(captured.join("")).toMatch(/malformed frontmatter/)
    } finally {
      ;(process.stderr as unknown as { write: typeof origStderr }).write =
        origStderr
      cleanup()
    }
  })
})

describe("handleListSkills", () => {
  it("returns helpful empty-state message when no skills are defined", () => {
    const out = handleListSkills([])
    expect(out.content[0]?.text).toContain(".helpbase/skills/")
    expect(out.content[0]?.text).toContain("get_skill")
  })

  it("formats skills as a markdown list with descriptions", () => {
    const out = handleListSkills([
      {
        name: "voice",
        description: "Tone",
        content: "",
        filePath: "/x/voice.md",
      },
      {
        name: "api",
        description: "",
        content: "",
        filePath: "/x/api.md",
      },
    ])
    const t = out.content[0]?.text ?? ""
    expect(t).toMatch(/## Skills/)
    expect(t).toMatch(/- voice — Tone/)
    // No description → no em-dash suffix
    expect(t).toMatch(/- api$/m)
  })
})

describe("handleGetSkill", () => {
  const skills = [
    {
      name: "voice",
      description: "Tone + voice",
      content: "Write active. Cut hedges. One idea per sentence.",
      filePath: "/x/voice.md",
    },
    {
      name: "api",
      description: "",
      content: "Backticks for params.",
      filePath: "/x/api.md",
    },
  ]

  it("returns the full content with a titled header", () => {
    const out = handleGetSkill(skills, { name: "voice" })
    const t = out.content[0]?.text ?? ""
    expect(t).toMatch(/^# voice\n> Tone \+ voice/)
    expect(t).toContain("Write active.")
  })

  it("omits the quote line when description is empty", () => {
    const out = handleGetSkill(skills, { name: "api" })
    const t = out.content[0]?.text ?? ""
    expect(t).toMatch(/^# api\n\nBackticks/)
    expect(t).not.toContain(">")
  })

  it("returns an error with available-names list when not found", () => {
    const out = handleGetSkill(skills, { name: "nonexistent" })
    expect(out.isError).toBe(true)
    const t = out.content[0]?.text ?? ""
    expect(t).toContain("No skill found")
    expect(t).toContain("voice, api")
  })

  it("returns the no-skills-defined message when skills list is empty", () => {
    const out = handleGetSkill([], { name: "anything" })
    expect(out.isError).toBe(true)
    expect(out.content[0]?.text).toContain("No skills are currently defined")
  })
})
