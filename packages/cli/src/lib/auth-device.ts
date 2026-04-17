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
  // Tolerate a short run of transient network failures (DNS blip, captive-
  // portal intercept, flaky LTE) during the polling window. Anything beyond
  // this means the user's connection is genuinely broken.
  const MAX_CONSECUTIVE_NETWORK_FAILS = 3
  let consecutiveFailures = 0

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

    let result
    try {
      result = await pollDeviceAuth(info.device_code, clientId)
    } catch (err) {
      // A thrown error here is either an RFC-shape mismatch (server sent
      // an unexpected status/JSON) or a transient network error. Don't let
      // a single DNS blip abort a 5-minute wait — retry a few times first.
      consecutiveFailures += 1
      if (consecutiveFailures >= MAX_CONSECUTIVE_NETWORK_FAILS) {
        throw new HelpbaseError({
          code: "E_DEVICE_NETWORK",
          problem: "Lost connection to helpbase.dev during login",
          cause:
            err instanceof Error
              ? `${consecutiveFailures} consecutive polling errors; last: ${err.message}`
              : `${consecutiveFailures} consecutive polling errors`,
          fix: [
            "Check your network connection",
            "Run `helpbase login` again once you're back online",
          ],
        })
      }
      continue
    }
    consecutiveFailures = 0
    if ("accessToken" in result) {
      let resp
      try {
        resp = await getSessionWithBearer(result.accessToken)
      } catch {
        // Treat this as a transient failure — the browser side succeeded,
        // we just couldn't hydrate the session. Retry the outer loop; the
        // next poll will take the "already-approved" branch again.
        consecutiveFailures += 1
        if (consecutiveFailures >= MAX_CONSECUTIVE_NETWORK_FAILS) {
          throw new HelpbaseError({
            code: "E_DEVICE_NETWORK",
            problem: "Lost connection to helpbase.dev during login",
            cause: "Could not fetch session after approval",
            fix: [
              "Check your network connection",
              "Run `helpbase login` again once you're back online",
            ],
          })
        }
        continue
      }
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
    let cmd: string
    let args: string[]
    if (process.platform === "darwin") {
      cmd = "open"
      args = [url]
    } else if (process.platform === "win32") {
      // `start` is a cmd.exe builtin, not a standalone exe, so spawning it
      // directly ENOENTs. The empty "" is `start`'s optional window-title
      // arg; without it, `start "<url>"` treats the URL as the title and
      // opens a blank cmd window instead of the browser.
      cmd = "cmd"
      args = ["/c", "start", "", url]
    } else {
      cmd = "xdg-open"
      args = [url]
    }
    // ChildProcess ENOENT surfaces as an async "error" event; without a
    // listener, Node historically re-raises it as unhandled. Attach a noop
    // listener so a missing xdg-open on a minimal container doesn't crash.
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" })
    child.on("error", () => {
      // best-effort — CLI prints the URL regardless
    })
    child.unref()
  } catch {
    // best-effort — CLI prints the URL regardless
  }
}
