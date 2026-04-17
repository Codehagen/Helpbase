import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const AUTH_FILE = path.join(os.homedir(), ".helpbase", "auth.json")

/**
 * Read the user's helpbase session token from ~/.helpbase/auth.json.
 *
 * The scaffolder uses this so first-time users who already ran
 * `helpbase login` from another project don't have to bring a BYOK key
 * just to kick off URL-based article generation — their existing session
 * gets forwarded to the hosted proxy and the free tier applies.
 *
 * Returns undefined when the file is missing, unreadable, or malformed.
 * Callers fall back to BYOK (AI_GATEWAY_API_KEY) or to the MissingApiKeyError
 * path, which surfaces the "run helpbase login" hint.
 *
 * We intentionally do not verify the token on disk: a stale token still
 * fails at the LLM call site with a clear error, and adding a server
 * round-trip here would slow every scaffold run for the rare case of a
 * token that expired yesterday.
 */
export function readHelpbaseAuthToken(): string | undefined {
  try {
    const raw = fs.readFileSync(AUTH_FILE, "utf-8")
    const parsed = JSON.parse(raw) as { access_token?: unknown }
    if (typeof parsed.access_token === "string" && parsed.access_token.length > 0) {
      return parsed.access_token
    }
  } catch {
    // Any read or parse error → treat as "no auth available".
  }
  return undefined
}
