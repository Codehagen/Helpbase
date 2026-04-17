import type { compileMDX } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import rehypeSlug from "rehype-slug"
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code"
import { createHighlighter, type Highlighter } from "shiki"

// Mirror the exact type compileMDX expects for its plugin lists. Pulled
// from next-mdx-remote's own signature so we don't need a direct dep on
// `unified` (where `PluggableList` canonically lives). If next-mdx-remote
// ever widens/narrows this, we follow it for free.
type MdxOptions = NonNullable<
  NonNullable<Parameters<typeof compileMDX>[0]["options"]>["mdxOptions"]
>
type PluginList = NonNullable<MdxOptions["rehypePlugins"]>

/**
 * Shared MDX pipeline config used by both the apex docs site
 * (lib/content.ts) and the hosted tenant route
 * (app/(tenant)/t/[tenant]/[...slug]/page.tsx).
 *
 * Having one source for the plugin list keeps syntax highlighting,
 * heading slugs, and GFM behavior identical across surfaces — the
 * divergence between the two pipelines is what left the tenant side
 * without prev/next + breadcrumbs for a while. Keep it consolidated.
 */

// Languages preloaded into the shared shiki highlighter. rehype-pretty-code
// otherwise lazy-loads per-fence and falls back to `defaultLang` when a
// lang isn't known, which is why ```mdx blocks were rendering as monochrome
// plaintext before QA flagged it on 2026-04-17 (ISSUE-002). Add to this
// list if new content uses a fence language that appears as plaintext.
const SHIKI_LANGS = [
  "bash",
  "shell",
  "sh",
  "zsh",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "mdx",
  "md",
  "json",
  "jsonc",
  "yaml",
  "toml",
  "html",
  "css",
  "diff",
  "python",
  "go",
  "ruby",
  "rust",
  "sql",
  "dockerfile",
] as const

const SHIKI_THEMES = ["github-light", "github-dark-dimmed"] as const

// One shared highlighter across the process. Shiki's `createHighlighter`
// is expensive (loads WASM + every language grammar), so we cache the
// promise and reuse it for every MDX compile. Next.js RSC keeps this in
// the server runtime; each request reuses the same instance.
let highlighterPromise: Promise<Highlighter> | null = null
function getSharedHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...SHIKI_THEMES],
      langs: [...SHIKI_LANGS],
    })
  }
  return highlighterPromise
}

export const prettyCodeOptions: PrettyCodeOptions = {
  // Dual-theme output: shiki injects inline styles keyed to a
  // data-theme attribute. `next-themes` toggles a class on <html>,
  // so we wire this to that class via CSS in globals.css (the
  // [data-theme] selector rehype-pretty-code emits is handled there).
  theme: {
    light: "github-light",
    dark: "github-dark-dimmed",
  },
  // Let shiki own the background on <pre> so colors line up with
  // tokens. Our own <pre> styling can still add padding/radius/border.
  keepBackground: true,
  // Don't crash on unknown language fences — fall back to plain text.
  defaultLang: "plaintext",
  // Skip the <span data-rehype-pretty-code-figure> wrapper on inline
  // `code` — we don't need token coloring for single-backtick code and
  // the wrapper plus figure-only CSS combined to push inline code onto
  // its own grid row with padding, which showed up as "inline `.mdx`
  // mysteriously appearing on its own indented line" in QA (ISSUE-003).
  bypassInlineCode: true,
  // Use the shared preloaded highlighter so all configured langs are
  // available synchronously at highlight time.
  getHighlighter: getSharedHighlighter,
}

export const remarkPlugins: PluginList = [remarkGfm]
export const rehypePlugins: PluginList = [
  rehypeSlug,
  [rehypePrettyCode, prettyCodeOptions],
]
