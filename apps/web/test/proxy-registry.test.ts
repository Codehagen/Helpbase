import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"

import { proxy } from "../proxy"

/**
 * Regression guard for the shadcn-CLI 406 bug.
 *
 * `proxy.ts` runs content negotiation on 2-segment apex paths so AI
 * agents get markdown when they ask for it. The first version treated
 * EVERY 2-segment path as an article, which meant `/r/<name>.json`
 * (the shadcn registry endpoint) also hit the negotiation branch.
 * shadcn CLI sends `Accept: application/json`, which is neither
 * `text/html` nor `text/markdown`, so the response was 406 and
 * `shadcn add https://helpbase.dev/r/helpbase-mcp.json` failed cold.
 *
 * This file locks the pass-through for /r/* so the bug can't regress.
 */

function makeReq(path: string, accept: string) {
  return new NextRequest(
    new Request(`https://helpbase.dev${path}`, {
      headers: { accept },
    }),
  )
}

describe("proxy — shadcn registry JSON pass-through", () => {
  it("does not 406 on /r/*.json with Accept: application/json", async () => {
    const req = makeReq("/r/helpbase-mcp.json", "application/json")
    const res = await proxy(req)
    expect(res.status).not.toBe(406)
  })

  it("does not 406 on /r/registry.json with Accept: application/json", async () => {
    const req = makeReq("/r/registry.json", "application/json")
    const res = await proxy(req)
    expect(res.status).not.toBe(406)
  })

  it("still 406s on a real article path when Accept is application/json", async () => {
    // Confirms the pass-through is scoped to /r/ and hasn't accidentally
    // disabled negotiation for actual article pages.
    const req = makeReq("/getting-started/introduction", "application/json")
    const res = await proxy(req)
    expect(res.status).toBe(406)
  })
})
