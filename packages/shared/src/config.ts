import { z } from "zod"

export const helpbaseConfigSchema = z.object({
  subdomain: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Use lowercase letters, numbers, and hyphens")
    .min(3, "Must be at least 3 characters")
    .max(40, "Must be 40 characters or less"),
  name: z.string().optional(),
  logo: z.string().optional(),
  theme: z
    .object({
      primary: z.string().optional(),
    })
    .optional(),
})

export type HelpbaseConfig = z.infer<typeof helpbaseConfigSchema>
