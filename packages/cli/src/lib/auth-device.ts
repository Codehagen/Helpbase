import { spawn } from "node:child_process"
import { HelpbaseError } from "./errors.js"
import { storeSession, toAuthSession, type AuthSession } from "./auth.js"
import {
  getSessionWithBearer,
  pollDeviceAuth,
  startDeviceAuth,
  type DeviceCodeResponse,
} from "./auth-client.js"

/**
 * Run the browser device-flow (RFC 8628) end-to-end. Callers:
 *   1. startDeviceAuth on the helpbase.dev auth server
 *   2. open the verification URL in the user's default browser
 *   3. poll the token endpoint, honoring the server-provided interval
 *   4. on success, persist the bearer as the CLI session
 *
 * The `onProgress` callback lets UI layers update their spinner text as
 * the wait drags on (progressive hints at T+30/90/240s per plan).
 */
export interface DeviceLoginOptions {
  clientId?: string
  onStart?: (info: DeviceCodeResponse) => void
  onProgress?: (elapsedMs: number) => void
  shouldOpenBrowser?: boolean
  signal?: AbortSignal
}

export async function deviceLogin(opts: DeviceLoginOptions = {}): Promise<AuthSession> {
  const clientId = opts.clientId ?? "helpbase-cli"
  const info = await startDeviceAuth(clientId)
  opts.onStart?.(info)

  if (opts.shouldOpenBrowser !== false) {
    openBrowser(info.verification_uri_complete || info.verification_uri)
  }

  const startedAt = Date.now()
  let interval = Math.max(info.interval ?? 2, 1) * 1000
  const deadline = startedAt + info.expires_in * 1000

  while (true) {
    if (opts.signal?.aborted) {
      throw new HelpbaseError({
        code: "E_AUTH_CANCELLED",
        problem: "Login cancelled",
        cause: "AbortSignal fired",
        fix: ["Run `helpbase login` again when you're ready"],
      })
    }
    if (Date.now() > deadline) {
      throw new HelpbaseError({
        code: "E_DEVICE_EXPIRED",
        problem: "Device code expired before authorization",
        cause: `The code expired after ${info.expires_in}s without an approval`,
        fix: ["Run `helpbase login` again to get a fresh code"],
      })
    }

    await sleep(interval)
    opts.onProgress?.(Date.now() - startedAt)

    const result = await pollDeviceAuth(info.device_code, clientId)
    if ("accessToken" in result) {
      const resp = await getSessionWithBearer(result.accessToken)
      if (!resp) {
        throw new HelpbaseError({
          code: "E_AUTH_VERIFY_OTP",
          problem: "Server issued a token but no session came back",
          cause: "getSession returned null with a freshly-minted bearer",
          fix: ["Run `helpbase login` again", "Check helpbase.dev status"],
        })
      }
      const session = toAuthSession(resp, result.accessToken)
      storeSession(session)
      return session
    }

    switch (result.error) {
      case "authorization_pending":
        continue
      case "slow_down":
        // Plugin asks us to back off. Add 5s per RFC.
        interval += 5000
        continue
      case "access_denied":
        throw new HelpbaseError({
          code: "E_DEVICE_DENIED",
          problem: "Authorization was cancelled in the browser",
          cause: result.description ?? "User clicked Cancel",
          fix: ["Run `helpbase login` again if that wasn't you"],
        })
      case "expired_token":
        throw new HelpbaseError({
          code: "E_DEVICE_EXPIRED",
          problem: "Device code expired before authorization",
          cause: result.description ?? "Token TTL elapsed",
          fix: ["Run `helpbase login` again to get a fresh code"],
        })
      default:
        throw new HelpbaseError({
          code: "E_AUTH_VERIFY_OTP",
          problem: "Device authorization failed",
          cause: result.description ?? result.error,
          fix: ["Run `helpbase login` again", "Or try `helpbase login --email`"],
        })
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Spawn the platform's URL-opener for the sign-in page. No-op on remote
 * environments (Codespaces, SSH) or when explicitly disabled — the CLI
 * prints the URL to stdout as a fallback anyway.
 */
export function openBrowser(url: string): void {
  const explicitOff = process.env.HELPBASE_LOGIN_NO_BROWSER === "1"
  const looksHeadless =
    process.env.CODESPACES === "true" ||
    Boolean(process.env.SSH_TTY) ||
    Boolean(process.env.SSH_CONNECTION)
  if (explicitOff || looksHeadless) {
    return
  }
  try {
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open"
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref()
  } catch {
    // best-effort — CLI prints the URL regardless
  }
}
