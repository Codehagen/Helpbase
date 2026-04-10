import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * These tests verify the MDX component palette is properly wired by
 * inspecting the source files. Full rendering tests require a React
 * test environment (jsdom) — these are structural correctness checks.
 */

const MDX_COMPONENTS_PATH = path.resolve(__dirname, "../lib/mdx-components.tsx")
const COMPONENTS_DIR = path.resolve(__dirname, "../components/mdx")

describe("MDX component map", () => {
  const source = fs.readFileSync(MDX_COMPONENTS_PATH, "utf-8")

  it("imports all 8 component files", () => {
    const expectedImports = [
      "callout",
      "figure",
      "video",
      "steps",
      "accordion",
      "tabs",
      "card-group",
      "cta-card",
    ]
    for (const name of expectedImports) {
      expect(source).toContain(`@/components/mdx/${name}`)
    }
  })

  it("exports all component names in the return map", () => {
    const expectedNames = [
      "Callout",
      "Figure",
      "Video",
      "Steps",
      "Step",
      "Accordion",
      "AccordionItem",
      "Tabs",
      "Tab",
      "CardGroup",
      "Card",
      "CtaCard",
    ]
    for (const name of expectedNames) {
      expect(source).toContain(name)
    }
  })

  it("has an img override routing through Figure", () => {
    expect(source).toContain("img:")
    expect(source).toContain("Figure")
  })
})

describe("MDX component files exist", () => {
  const expectedFiles = [
    "callout.tsx",
    "figure.tsx",
    "video.tsx",
    "steps.tsx",
    "accordion.tsx",
    "tabs.tsx",
    "card-group.tsx",
    "cta-card.tsx",
  ]

  for (const file of expectedFiles) {
    it(`${file} exists and exports a component`, () => {
      const filePath = path.join(COMPONENTS_DIR, file)
      expect(fs.existsSync(filePath)).toBe(true)

      const content = fs.readFileSync(filePath, "utf-8")
      expect(content).toMatch(/export function \w+/)
    })
  }
})
