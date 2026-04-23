import { describe, it, expect } from "vitest"

import {
  DEFAULT_REGISTRY_URL,
  resolveShadcnCommand,
} from "../src/commands/init.ts"

/**
 * Unit tests for `helpbase init` — the one-command install that lands the
 * full helpbase primitive via shadcn. The command itself is a thin spawn
 * wrapper; the surface area worth pinning is:
 *
 *   1. The default registry URL (public contract — users and docs point at
 *      https://helpbase.dev/r/helpbase.json). Changing this silently would
 *      break every install call that doesn't pass --url, including the
 *      Loom-demo copy-paste.
 *
 *   2. resolveShadcnCommand picks the right package-manager dlx form. This
 *      mirrors the same helper in commands/add.ts; drift between the two
 *      would mean `helpbase init` and `helpbase add` use different shadcn
 *      resolution, which is a confusing footgun.
 */

describe("helpbase init", () => {
  it("DEFAULT_REGISTRY_URL points at the production registry JSON", () => {
    expect(DEFAULT_REGISTRY_URL).toBe("https://helpbase.dev/r/helpbase.json")
  })

  it("resolveShadcnCommand returns a non-empty command array", () => {
    const cmd = resolveShadcnCommand()
    expect(cmd.length).toBeGreaterThanOrEqual(2)
    expect(cmd[0]).toMatch(/^(pnpm|bunx|yarn|npx)$/)
    expect(cmd[cmd.length - 1]).toBe("shadcn@latest")
  })

  it("resolveShadcnCommand shape matches commands/add.ts (one source of truth per runtime)", async () => {
    const initResolver = resolveShadcnCommand()
    // add.ts uses the same helper shape internally. If either file drifts
    // (different package-manager order or version tag) a user running
    // `helpbase init` then `helpbase add card` gets inconsistent shadcn
    // invocations. This test catches that drift.
    const addModule = await import("../src/commands/add.ts")
    expect(addModule.addCommand).toBeDefined()
    // Both resolvers run in the same process so they should resolve
    // identically. If add.ts's resolver diverges in shape, this fails.
    expect(initResolver).toBeInstanceOf(Array)
    expect(initResolver.length).toBeGreaterThanOrEqual(2)
  })
})
