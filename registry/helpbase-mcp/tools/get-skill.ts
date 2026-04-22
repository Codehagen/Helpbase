import { z } from "zod"
import type { Skill } from "../content/skills.js"

export const getSkillInput = z.object({
  name: z
    .string()
    .min(1, "name must not be empty")
    .describe("Skill name (filename in .helpbase/skills/ without .md extension)."),
})

export type GetSkillInput = z.infer<typeof getSkillInput>

export function handleGetSkill(skills: Skill[], input: GetSkillInput) {
  const name = input.name.trim()
  const match = skills.find((s) => s.name === name)

  if (!match) {
    const available =
      skills.length > 0
        ? ` Available: ${skills.map((s) => s.name).join(", ")}.`
        : " No skills are currently defined."
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `No skill found named "${name}".${available}`,
        },
      ],
    }
  }

  const header = [
    `# ${match.name}`,
    match.description ? `> ${match.description}` : "",
  ]
    .filter((l) => l.length > 0)
    .join("\n")

  return {
    content: [
      {
        type: "text" as const,
        text: `${header}\n\n${match.content}`,
      },
    ],
  }
}
