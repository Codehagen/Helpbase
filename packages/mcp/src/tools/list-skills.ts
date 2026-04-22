import { z } from "zod"
import type { Skill } from "../content/skills.js"

export const listSkillsInput = z.object({}).describe("No inputs.")

export type ListSkillsInput = z.infer<typeof listSkillsInput>

export function handleListSkills(skills: Skill[]) {
  if (skills.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            "No skills defined. Add markdown files to .helpbase/skills/ to " +
            "define writing-style, tone, or formatting rules that agents " +
            "can pull via get_skill.",
        },
      ],
    }
  }

  const lines: string[] = ["## Skills", ""]
  for (const s of skills) {
    const desc = s.description ? ` — ${s.description}` : ""
    lines.push(`- ${s.name}${desc}`)
  }
  lines.push("", "Fetch a skill via get_skill({ name }).")

  return {
    content: [
      {
        type: "text" as const,
        text: lines.join("\n"),
      },
    ],
  }
}
