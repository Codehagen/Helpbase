import fs from "node:fs"
import path from "node:path"

/**
 * Per-repo binding between a local helpbase project and a remote tenant.
 * Committed to the repo so every contributor deploys to the same tenant.
 *
 * Location: .helpbase/project.json at the repo root (the directory where
 * commands are run from — we don't walk up to find git roots because a repo
 * may contain multiple helpbase projects under subdirectories).
 */

export interface ProjectConfig {
  tenantId: string
  slug: string
}

const DIR = ".helpbase"
const FILE = path.join(DIR, "project.json")

export function getProjectConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, FILE)
}

export function readProjectConfig(cwd = process.cwd()): ProjectConfig | null {
  const filePath = getProjectConfigPath(cwd)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw) as Partial<ProjectConfig>
    if (typeof parsed.tenantId !== "string" || typeof parsed.slug !== "string") {
      return null
    }
    return { tenantId: parsed.tenantId, slug: parsed.slug }
  } catch {
    return null
  }
}

export function writeProjectConfig(
  config: ProjectConfig,
  cwd = process.cwd(),
): void {
  const dir = path.join(cwd, DIR)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(
    path.join(cwd, FILE),
    JSON.stringify(config, null, 2) + "\n",
  )
}

export function removeProjectConfig(cwd = process.cwd()): boolean {
  const filePath = getProjectConfigPath(cwd)
  if (!fs.existsSync(filePath)) return false
  fs.unlinkSync(filePath)
  return true
}
