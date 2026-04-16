import { describe, it, expect } from "vitest"
import path from "node:path"

import { resolveContentDir } from "../lib/content-dir"

/**
 * `helpbase preview` sets `HELPBASE_CONTENT_DIR` in the child env before
 * spawning `next dev`, so the renderer reads the user project's
 * `.helpbase/docs/` instead of the scaffolder's built-in sample content.
 * If that env var stops being respected, preview silently renders the
 * wrong docs. Pin the behavior.
 */
describe("resolveContentDir", () => {
  it("falls back to <cwd>/content when no env override is set", () => {
    const result = resolveContentDir({}, "/tmp/some-project")
    expect(result).toBe("/tmp/some-project/content")
  })

  it("honors an absolute HELPBASE_CONTENT_DIR", () => {
    const result = resolveContentDir(
      { HELPBASE_CONTENT_DIR: "/abs/elsewhere/docs" },
      "/tmp/some-project",
    )
    expect(result).toBe("/abs/elsewhere/docs")
  })

  it("resolves relative HELPBASE_CONTENT_DIR against cwd", () => {
    const result = resolveContentDir(
      { HELPBASE_CONTENT_DIR: ".helpbase/docs" },
      "/tmp/some-project",
    )
    expect(result).toBe(path.resolve("/tmp/some-project", ".helpbase/docs"))
  })

  it("treats empty env var as unset (falls back to default)", () => {
    const result = resolveContentDir({ HELPBASE_CONTENT_DIR: "" }, "/tmp/some-project")
    expect(result).toBe("/tmp/some-project/content")
  })
})
