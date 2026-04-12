import fs from "node:fs"
import path from "node:path"

/**
 * Write `AI_GATEWAY_API_KEY=<value>` into the scaffolded project's
 * `.env.local`. Idempotent: if the key already exists, replace the line.
 * If `.env.local` doesn't exist, create it. Next.js + the helpbase CLI
 * both read `.env.local` at the project root, so one file serves both.
 */
export function writeAiGatewayKey(projectDir: string, key: string): void {
  const envPath = path.join(projectDir, ".env.local")
  const line = `AI_GATEWAY_API_KEY=${key}`

  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, `${line}\n`, { mode: 0o600 })
    return
  }

  const existing = fs.readFileSync(envPath, "utf-8")
  const lines = existing.split("\n")
  let replaced = false
  const next = lines.map((l) => {
    if (l.startsWith("AI_GATEWAY_API_KEY=")) {
      replaced = true
      return line
    }
    return l
  })
  if (!replaced) {
    if (next.length > 0 && next[next.length - 1] !== "") next.push(line)
    else next.splice(next.length - 1, 0, line)
  }
  fs.writeFileSync(envPath, next.join("\n"), { mode: 0o600 })
}
