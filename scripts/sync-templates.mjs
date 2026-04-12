#!/usr/bin/env node
/**
 * Sync apps/web → two output targets:
 *
 *   1. packages/create-helpbase/templates/  (the scaffolder templates)
 *   2. registry/helpbase/                    (the shadcn registry source tree)
 *
 * Why two targets?
 *
 * - apps/web is the canonical help center UI. It's deeply coupled to the
 *   pnpm workspace via @workspace/ui and @workspace/shared.
 * - Both distribution channels need a standalone, workspace-free copy.
 *   Without a sync, the scaffolder and the registry silently drift from
 *   apps/web. That gap is what shipped a 2-file stub on 2026-04-09.
 *
 * Differences between the two outputs:
 *
 * TEMPLATES (create-helpbase):
 *   - Target is a brand-new Next.js project. We control everything.
 *   - Ships app/layout.tsx, app/page.tsx, app/globals.css, tsconfig.json,
 *     next.config.mjs, package.json, etc.
 *   - Inlines lib/utils.ts (the cn helper) and components/ui/badge.tsx.
 *
 * REGISTRY (shadcn add):
 *   - Target is an existing Next.js + shadcn project. The user already has
 *     app/layout.tsx, app/globals.css, lib/utils.ts, and shadcn's components/ui.
 *   - Does NOT ship root layout, root page, globals.css, tsconfig, etc.
 *   - Does NOT ship lib/utils.ts (shadcn provides `cn`).
 *   - Does NOT ship components/ui/badge.tsx (handled via registryDependencies).
 *   - DOES ship: components/, lib/, content/, app/(docs)/ pages, plus a
 *     side-loaded app/(docs)/helpbase-styles.css with our keyframes,
 *     animations, and .article-content typography.
 *   - The registry docs layout is a minimal re-implementation that drops
 *     into an existing root layout additively (no Header/Footer/ThemeProvider)
 *     rather than the apps/web version which relies on the root layout for
 *     Header/Footer/SearchDialog.
 *
 * CI gate: `pnpm sync:templates && git diff --exit-code` in both
 * packages/create-helpbase/templates/ and registry/helpbase/. If a
 * contributor changes apps/web without re-running sync, CI fails.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync, copyFileSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "..")
const APPS_WEB = join(REPO_ROOT, "apps/web")
const SHARED_SRC = join(REPO_ROOT, "packages/shared/src")
const UI_SRC = join(REPO_ROOT, "packages/ui/src")
const TEMPLATES = join(REPO_ROOT, "packages/create-helpbase/templates")
const REGISTRY = join(REPO_ROOT, "registry/helpbase")

// Directories to walk in apps/web for the templates target. Allowlist:
// new files in apps/web only get included if they live under one of these.
const APPS_WEB_DIRS = ["app", "components", "lib", "content"]

// Files/directories to exclude from standalone targets (templates + registry).
// The hosted tier (tenant routes, tenant-content, hosted-mdx-components,
// supabase client) is only available via `helpbase deploy` to Supabase —
// neither scaffolded projects nor shadcn registry consumers ship it.
const HOSTED_TIER_EXCLUDES = [
  "app/(tenant)/",
  "app/(main)/errors/",
  "lib/tenant-content.ts",
  "lib/hosted-mdx-components.tsx",
  "lib/supabase.ts",
]

// Import transform map. Each @workspace/* prefix maps to a local @/* path.
// When a contributor adds a new @workspace/* import to apps/web, they must
// add an entry here. The validation step at the end fails loudly if not.
const IMPORT_TRANSFORMS = {
  "@workspace/ui/lib/utils": "@/lib/utils",
  "@workspace/ui/components/badge": "@/components/ui/badge",
  "@workspace/shared/types": "@/lib/types",
  "@workspace/shared/slugify": "@/lib/slugify",
  "@workspace/shared/schemas": "@/lib/schemas",
}

// Side-effect imports (no symbols imported, just executed for side effects).
// These get rewritten to relative paths because they're typically CSS imports
// that live next to the importing file in the standalone project.
const SIDE_EFFECT_TRANSFORMS = {
  "@workspace/ui/globals.css": "./globals.css",
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers shared by both output targets
// ─────────────────────────────────────────────────────────────────────────────

function walkFiles(dir) {
  const out = []
  function walk(current) {
    const entries = readdirSync(current).sort()
    for (const entry of entries) {
      const full = join(current, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walk(full)
      } else {
        out.push(relative(dir, full))
      }
    }
  }
  walk(dir)
  return out
}

function transformImports(content) {
  let out = content
  for (const [from, to] of Object.entries(SIDE_EFFECT_TRANSFORMS)) {
    const re = new RegExp(`(import\\s+)(["'])${escapeRegex(from)}\\2`, "g")
    out = out.replace(re, `$1$2${to}$2`)
  }
  for (const [from, to] of Object.entries(IMPORT_TRANSFORMS)) {
    const re = new RegExp(`(from\\s+)(["'])${escapeRegex(from)}\\2`, "g")
    out = out.replace(re, `$1$2${to}$2`)
  }
  return out
}

function transformCss(content) {
  return content
    .split("\n")
    .filter((line) => !line.trim().startsWith("@source"))
    .join("\n")
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".mdx",
  ".md",
  ".gitkeep",
])

function isTextFile(filename) {
  if (filename.startsWith(".")) return true
  const dot = filename.lastIndexOf(".")
  if (dot === -1) return false
  return TEXT_EXTENSIONS.has(filename.slice(dot))
}

/**
 * Walk one of the two output trees and grep every text file for any
 * remaining `@workspace/*` imports. Fails loudly with file:line if any
 * are found.
 *
 * This is the load-bearing safeguard against silent drift. The CEO and
 * eng reviews specifically called it out as the single most important
 * test in the sync story.
 */
function validateNoWorkspaceImportsRemain(rootDir, label) {
  const offenders = []
  const files = walkFiles(rootDir)
  for (const rel of files) {
    const full = join(rootDir, rel)
    if (
      !rel.endsWith(".ts") &&
      !rel.endsWith(".tsx") &&
      !rel.endsWith(".css") &&
      !rel.endsWith(".json") &&
      !rel.endsWith(".mjs")
    ) {
      continue
    }
    const content = readFileSync(full, "utf-8")
    const lines = content.split("\n")
    lines.forEach((line, i) => {
      if (line.includes("@workspace/")) {
        offenders.push(`  ${rel}:${i + 1}: ${line.trim()}`)
      }
    })
  }
  if (offenders.length > 0) {
    console.error(`\n✖ ${label} still contain @workspace/* references:`)
    console.error(offenders.join("\n"))
    console.error(
      "\nFix: add the missing prefix to IMPORT_TRANSFORMS or SIDE_EFFECT_TRANSFORMS\n" +
        "in scripts/sync-templates.mjs, then re-run `pnpm sync:templates`.\n",
    )
    process.exit(1)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Target 1: create-helpbase templates
// ─────────────────────────────────────────────────────────────────────────────

function copyAppsWebFileToTemplates(relativePath) {
  const src = join(APPS_WEB, relativePath)
  const dest = join(TEMPLATES, relativePath)

  if (!isTextFile(relativePath.split("/").pop())) {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    return
  }

  let content = readFileSync(src, "utf-8")
  if (relativePath.endsWith(".ts") || relativePath.endsWith(".tsx")) {
    content = transformImports(content)
  }
  if (relativePath === "app/layout.tsx") {
    content = injectMetadata(content)
  }
  writeFile(dest, content)
}

/**
 * Inject a Next.js Metadata export into app/layout.tsx with the project
 * name token. scaffold.ts replaces the token at scaffold time.
 *
 * Apps/web doesn't export metadata (mild oversight). The scaffolded project
 * should ship with proper SEO metadata baked in.
 */
function injectMetadata(content) {
  if (content.includes("export const metadata")) return content

  const lines = content.split("\n")
  let lastImportIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i]) || /^import\s\{/.test(lines[i])) {
      lastImportIdx = i
    }
  }
  if (lastImportIdx === -1) return content

  const metadataBlock = [
    "",
    "import type { Metadata } from \"next\"",
    "",
    "export const metadata: Metadata = {",
    "  title: \"__HELPBASE_PROJECT_NAME__ | Help Center\",",
    "  description: \"Help center powered by helpbase.\",",
    "}",
  ]
  lines.splice(lastImportIdx + 1, 0, ...metadataBlock)
  return lines.join("\n")
}

function inlineWorkspaceUtilitiesToTemplates() {
  const utilities = [
    { src: join(SHARED_SRC, "types.ts"), dest: join(TEMPLATES, "lib/types.ts") },
    { src: join(SHARED_SRC, "slugify.ts"), dest: join(TEMPLATES, "lib/slugify.ts") },
    { src: join(SHARED_SRC, "schemas.ts"), dest: join(TEMPLATES, "lib/schemas.ts") },
    { src: join(UI_SRC, "lib/utils.ts"), dest: join(TEMPLATES, "lib/utils.ts") },
  ]
  for (const { src, dest } of utilities) {
    let content = readFileSync(src, "utf-8")
    content = transformImports(content)
    writeFile(dest, content)
  }
}

function inlineShadcnPrimitivesToTemplates() {
  const src = join(UI_SRC, "components/badge.tsx")
  const dest = join(TEMPLATES, "components/ui/badge.tsx")
  let content = readFileSync(src, "utf-8")
  content = transformImports(content)
  writeFile(dest, content)
}

function inlineGlobalsCssToTemplates() {
  const src = join(UI_SRC, "styles/globals.css")
  const dest = join(TEMPLATES, "app/globals.css")
  let content = readFileSync(src, "utf-8")
  content = transformCss(content)
  writeFile(dest, content)
}

function generateTemplatesTsConfig() {
  const tsconfig = {
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "react-jsx",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: { "@/*": ["./*"] },
    },
    include: [
      "next-env.d.ts",
      "**/*.ts",
      "**/*.tsx",
      ".next/types/**/*.ts",
      ".next/dev/types/**/*.ts",
    ],
    exclude: ["node_modules"],
  }
  writeFile(join(TEMPLATES, "tsconfig.json"), JSON.stringify(tsconfig, null, 2) + "\n")
}

function generateTemplatesNextConfig() {
  const content = `/** @type {import('next').NextConfig} */
const nextConfig = {}

export default nextConfig
`
  writeFile(join(TEMPLATES, "next.config.mjs"), content)
}

function generateTemplatesPostCssConfig() {
  const content = `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
`
  writeFile(join(TEMPLATES, "postcss.config.mjs"), content)
}

function generateTemplatesComponentsJson() {
  const componentsJson = {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: true,
    tsx: true,
    tailwind: {
      config: "",
      css: "app/globals.css",
      baseColor: "neutral",
      cssVariables: true,
    },
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
    iconLibrary: "lucide",
  }
  writeFile(
    join(TEMPLATES, "components.json"),
    JSON.stringify(componentsJson, null, 2) + "\n",
  )
}

function generateTemplatesEslintConfig() {
  const content = `import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
]

export default eslintConfig
`
  writeFile(join(TEMPLATES, "eslint.config.mjs"), content)
}

function writeTemplatesHelpbaseMd() {
  const src = join(REPO_ROOT, "packages/create-helpbase/HELPBASE.md.template")
  const content = existsSync(src)
    ? readFileSync(src, "utf-8")
    : DEFAULT_HELPBASE_MD
  writeFile(join(TEMPLATES, "HELPBASE.md"), content)
}

const DEFAULT_HELPBASE_MD = `# helpbase

This is your help center. See https://helpbase.dev/docs for the full guide.
`

function generateTemplatesGitignore() {
  const content = `# dependencies
node_modules

# next.js
.next
out

# build output
dist

# env
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# misc
.DS_Store
*.pem
.vscode
.idea
`
  writeFile(join(TEMPLATES, ".gitignore"), content)
}

function generateTemplatesPackageJson() {
  const pkg = {
    name: "__HELPBASE_PROJECT_NAME__",
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      dev: "next dev --turbopack",
      build: "next build",
      start: "next start",
      lint: "eslint",
      generate: "helpbase generate",
      audit: "helpbase audit",
    },
    dependencies: {
      next: "^16.1.6",
      react: "^19.2.4",
      "react-dom": "^19.2.4",
      "next-mdx-remote": "^6.0.0",
      "next-themes": "^0.4.6",
      "gray-matter": "^4.0.3",
      "rehype-slug": "^6.0.0",
      "remark-gfm": "^4.0.0",
      zod: "^4.3.6",
      clsx: "^2.1.1",
      "tailwind-merge": "^3.5.0",
      "class-variance-authority": "^0.7.1",
      "lucide-react": "^1.8.0",
      "radix-ui": "^1.4.3",
      "tw-animate-css": "^1.4.0",
      shadcn: "^4.2.0",
    },
    devDependencies: {
      "@tailwindcss/postcss": "^4.1.18",
      "@tailwindcss/typography": "^0.5.19",
      tailwindcss: "^4.1.18",
      typescript: "^5.9.3",
      "@types/node": "^22.0.0",
      "@types/react": "^19.2.0",
      "@types/react-dom": "^19.2.0",
      eslint: "^9.39.2",
      "eslint-config-next": "^16.1.6",
      "@eslint/eslintrc": "^3.3.1",
    },
  }
  writeFile(join(TEMPLATES, "package.json"), JSON.stringify(pkg, null, 2) + "\n")
}

function syncTemplates() {
  console.log("Syncing apps/web → packages/create-helpbase/templates/")

  if (existsSync(TEMPLATES)) {
    rmSync(TEMPLATES, { recursive: true, force: true })
  }
  mkdirSync(TEMPLATES, { recursive: true })

  let copiedCount = 0
  let skippedCount = 0
  for (const dir of APPS_WEB_DIRS) {
    const fullDir = join(APPS_WEB, dir)
    if (!existsSync(fullDir)) continue
    const files = walkFiles(fullDir)
    for (const rel of files) {
      const relPath = join(dir, rel)
      if (HOSTED_TIER_EXCLUDES.some((p) => relPath.startsWith(p))) {
        skippedCount++
        continue
      }
      copyAppsWebFileToTemplates(relPath)
      copiedCount++
    }
  }
  console.log(`  ✓ Copied ${copiedCount} files from apps/web/ (skipped ${skippedCount} hosted-tier files)`)

  inlineWorkspaceUtilitiesToTemplates()
  console.log("  ✓ Inlined 4 workspace utilities into templates/lib/")

  inlineShadcnPrimitivesToTemplates()
  console.log("  ✓ Inlined 1 shadcn primitive (Badge) into templates/components/ui/")

  inlineGlobalsCssToTemplates()
  console.log("  ✓ Inlined globals.css into templates/app/globals.css")

  generateTemplatesTsConfig()
  generateTemplatesNextConfig()
  generateTemplatesPostCssConfig()
  generateTemplatesComponentsJson()
  generateTemplatesEslintConfig()
  generateTemplatesGitignore()
  generateTemplatesPackageJson()
  writeTemplatesHelpbaseMd()
  console.log("  ✓ Generated 8 config files (tsconfig, next, postcss, components, eslint, gitignore, package, HELPBASE.md)")

  validateNoWorkspaceImportsRemain(TEMPLATES, "Templates")
  console.log("  ✓ Validation passed: no @workspace/* references in templates")
}

// ─────────────────────────────────────────────────────────────────────────────
// Target 2: shadcn registry source tree (registry/helpbase/)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Copy a text file from apps/web into registry/helpbase/ with import
 * transforms applied. Same transform rules as the templates target —
 * the output tree is a standalone, workspace-free copy.
 */
function copyAppsWebFileToRegistry(relativePath, { srcRelativePath } = {}) {
  const src = join(APPS_WEB, srcRelativePath || relativePath)
  const dest = join(REGISTRY, relativePath)

  if (!isTextFile(relativePath.split("/").pop())) {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    return
  }

  let content = readFileSync(src, "utf-8")
  if (relativePath.endsWith(".ts") || relativePath.endsWith(".tsx")) {
    content = transformImports(content)
  }
  writeFile(dest, content)
}

/**
 * Inline workspace utilities the consumer doesn't already have.
 * NOT included: utils.ts (user's shadcn init created lib/utils.ts already).
 */
function inlineWorkspaceUtilitiesToRegistry() {
  const utilities = [
    { src: join(SHARED_SRC, "types.ts"), dest: join(REGISTRY, "lib/types.ts") },
    { src: join(SHARED_SRC, "slugify.ts"), dest: join(REGISTRY, "lib/slugify.ts") },
    { src: join(SHARED_SRC, "schemas.ts"), dest: join(REGISTRY, "lib/schemas.ts") },
  ]
  for (const { src, dest } of utilities) {
    let content = readFileSync(src, "utf-8")
    content = transformImports(content)
    writeFile(dest, content)
  }
}

/**
 * Generate a minimal docs layout for the registry target.
 *
 * Why different from apps/web's layout: apps/web relies on its root layout
 * to provide Header, Footer, SearchDialog, and ThemeProvider. In the
 * registry case, the consumer already has their own root layout — we can't
 * overwrite it. So the docs layout is designed to be additive: it provides
 * the sidebar shell and mounts SearchDialog (so Cmd+K works), and nothing
 * else. Users who want a full helpbase header can import the Header
 * component into their own root layout.
 *
 * Also imports a side-loaded CSS file with our custom keyframes,
 * animations, and .article-content typography — stuff that can't live in
 * shadcn's cssVars block.
 */
function generateRegistryDocsLayout() {
  const content = `import { getCategories } from "@/lib/content"
import { getSearchIndex } from "@/lib/search"
import { DocsSidebar } from "@/components/docs-sidebar"
import { MobileSidebar } from "@/components/mobile-sidebar"
import { SearchDialog } from "@/components/search-dialog"
import "./helpbase-styles.css"

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [categories, searchItems] = await Promise.all([
    getCategories(),
    getSearchIndex(),
  ])

  return (
    <>
      <div className="mx-auto max-w-7xl">
        <div className="flex">
          {/* Desktop sidebar */}
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="sticky top-14 h-[calc(100svh-3.5rem)] overflow-y-auto border-r border-border/50 px-4 py-8">
              <DocsSidebar categories={categories} />
            </div>
          </aside>

          {/* Mobile sidebar trigger */}
          <div className="lg:hidden">
            <MobileSidebar categories={categories} />
          </div>

          {/* Main content */}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>

      {/* Cmd+K search — mounts invisibly, opens on keyboard shortcut */}
      <SearchDialog items={searchItems} />
    </>
  )
}
`
  writeFile(join(REGISTRY, "app/(docs)/layout.tsx"), content)
}

/**
 * Generate the side-loaded helpbase-styles.css.
 *
 * This contains everything from apps/web globals.css that is NOT a plain
 * CSS variable — keyframes, @layer base additions, .animate-*, .toc-indicator,
 * @media (prefers-reduced-motion), and the .article-content typography
 * block that MDX rendering depends on.
 *
 * CSS variables themselves are shipped via the `cssVars` field in
 * registry.json (shadcn merges them into the user's existing globals.css).
 *
 * The custom easing tokens live in :root here because they're helpbase-only
 * and it's simpler than teaching shadcn about non-color vars.
 */
function generateRegistryHelpbaseStyles() {
  const content = `/* helpbase styles — loaded by app/(docs)/layout.tsx.
 * CSS variables themselves come in via the cssVars field in the registry
 * item. This file carries the non-variable rules: keyframes, animations,
 * the .article-content typography used by MDX rendering, and the
 * prefers-reduced-motion escape hatch.
 */

/* Custom easing tokens (Emil Kowalski's animations.dev methodology) */
:root {
  --ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1);
  --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
  --ease-in-out-quad: cubic-bezier(0.455, 0.03, 0.515, 0.955);
}

/* Animations */
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scale-fade-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-fade-in {
  will-change: transform, opacity;
  animation: fade-in 0.4s var(--ease-out-quad) both;
}

.animate-fade-in-delay-1 {
  will-change: transform, opacity;
  animation: fade-in 0.4s var(--ease-out-quad) 0.1s both;
}

.animate-fade-in-delay-2 {
  will-change: transform, opacity;
  animation: fade-in 0.4s var(--ease-out-quad) 0.2s both;
}

.animate-scale-fade-in {
  will-change: transform, opacity;
  animation: scale-fade-in 0.2s var(--ease-out-quad) both;
}

/* TOC sliding indicator —
 * ease-in-out: element already on screen moving to new position.
 * transform + opacity only: GPU-accelerated, no layout thrash.
 */
.toc-indicator {
  will-change: transform, opacity;
  transition:
    transform 0.2s var(--ease-in-out-quad),
    height 0.2s var(--ease-in-out-quad),
    opacity 0.15s ease;
}

/* Accessibility: disable all animations for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in,
  .animate-fade-in-delay-1,
  .animate-fade-in-delay-2,
  .animate-scale-fade-in {
    animation: none;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Article content typography — consumed by the MDX page renderer */
.article-content {
  line-height: 1.75;
  color: var(--foreground);
}

.article-content h1 {
  font-size: 2.25rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  margin-top: 2.5rem;
  margin-bottom: 1rem;
  scroll-margin-top: 5rem;
}

.article-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
  scroll-margin-top: 5rem;
}

.article-content h3 {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  margin-top: 2rem;
  margin-bottom: 0.5rem;
  scroll-margin-top: 5rem;
}

.article-content p {
  margin-top: 0;
  margin-bottom: 1.25rem;
  line-height: 1.75;
}

.article-content a {
  color: var(--foreground);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: var(--border);
  transition: text-decoration-color 0.15s;
}

.article-content a:hover {
  text-decoration-color: var(--foreground);
}

.article-content strong {
  font-weight: 600;
}

.article-content ul,
.article-content ol {
  margin-top: 0;
  margin-bottom: 1.25rem;
  padding-left: 1.5rem;
}

.article-content li {
  margin-bottom: 0.375rem;
}

.article-content ul > li {
  list-style-type: disc;
}

.article-content ol > li {
  list-style-type: decimal;
}

.article-content code {
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 0.875em;
  background: var(--muted);
  border-radius: 0.375rem;
  padding: 0.125rem 0.375rem;
}

.article-content pre {
  margin-top: 0;
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--muted);
  overflow-x: auto;
  font-size: 0.875rem;
  line-height: 1.7;
}

.article-content pre code {
  background: transparent;
  border-radius: 0;
  padding: 0;
  font-size: inherit;
}

.article-content blockquote {
  margin-top: 0;
  margin-bottom: 1.25rem;
  padding-left: 1rem;
  border-left: 3px solid var(--border);
  color: var(--muted-foreground);
  font-style: italic;
}

.article-content hr {
  margin: 2rem 0;
  border: none;
  border-top: 1px solid var(--border);
}

.article-content img {
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  margin-top: 0.5rem;
  margin-bottom: 1.5rem;
}

.article-content table {
  width: 100%;
  margin-bottom: 1.5rem;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.article-content th {
  text-align: left;
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid var(--border);
}

.article-content td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.article-content tr:last-child td {
  border-bottom: none;
}
`
  writeFile(join(REGISTRY, "app/(docs)/helpbase-styles.css"), content)
}

function syncRegistry() {
  console.log("\nSyncing apps/web → registry/helpbase/")

  if (existsSync(REGISTRY)) {
    rmSync(REGISTRY, { recursive: true, force: true })
  }
  mkdirSync(REGISTRY, { recursive: true })

  // Copy components/ (all 8 component files)
  const componentFiles = walkFiles(join(APPS_WEB, "components")).filter(
    (f) => !f.endsWith(".gitkeep"),
  )
  for (const rel of componentFiles) {
    copyAppsWebFileToRegistry(join("components", rel))
  }
  console.log(`  ✓ Copied ${componentFiles.length} component files`)

  // Copy lib/ (apps/web lib files: content, search, toc, etc.)
  // Excludes hosted-tier files (tenant-content, hosted-mdx-components, supabase).
  const libFiles = walkFiles(join(APPS_WEB, "lib")).filter(
    (f) => !f.endsWith(".gitkeep") && !HOSTED_TIER_EXCLUDES.includes(`lib/${f}`),
  )
  for (const rel of libFiles) {
    copyAppsWebFileToRegistry(join("lib", rel))
  }
  console.log(`  ✓ Copied ${libFiles.length} lib files`)

  // Inline workspace utilities (types, slugify, schemas) — NOT utils.ts
  inlineWorkspaceUtilitiesToRegistry()
  console.log("  ✓ Inlined 3 workspace utilities into registry/lib/")

  // Copy content/ directory
  const contentFiles = walkFiles(join(APPS_WEB, "content"))
  for (const rel of contentFiles) {
    copyAppsWebFileToRegistry(join("content", rel))
  }
  console.log(`  ✓ Copied ${contentFiles.length} content files`)

  // Copy app/(main)/(docs)/[category]/** (the dynamic routes, but NOT the
  // layout — we generate a registry-specific layout below). The source path
  // is under (main)/ due to the hosted tier route group split, but the
  // registry output omits (main)/ since the consumer doesn't have the
  // hosted tier's route group structure.
  const docsCategoryFiles = walkFiles(join(APPS_WEB, "app/(main)/(docs)/[category]"))
  for (const rel of docsCategoryFiles) {
    copyAppsWebFileToRegistry(join("app/(docs)/[category]", rel), {
      srcRelativePath: join("app/(main)/(docs)/[category]", rel),
    })
  }
  console.log(`  ✓ Copied ${docsCategoryFiles.length} app/(docs) page files`)

  // Generate the registry-specific docs layout (additive version without
  // Header/Footer/ThemeProvider so it drops into an existing root layout).
  generateRegistryDocsLayout()
  console.log("  ✓ Generated registry-specific app/(docs)/layout.tsx")

  // Generate the side-loaded helpbase-styles.css (keyframes, animations,
  // .article-content typography — everything that isn't a plain CSS var).
  generateRegistryHelpbaseStyles()
  console.log("  ✓ Generated app/(docs)/helpbase-styles.css")

  validateNoWorkspaceImportsRemain(REGISTRY, "Registry")
  console.log("  ✓ Validation passed: no @workspace/* references in registry")
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  syncTemplates()
  syncRegistry()
  console.log("\nDone. Run `pnpm --filter create-helpbase build` to refresh dist/,")
  console.log("and `pnpm registry:build` to refresh public/r/*.json.\n")
}

main()
