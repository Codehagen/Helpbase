import remarkGfm from "remark-gfm"
import rehypeSlug from "rehype-slug"
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code"

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
}

export const remarkPlugins = [remarkGfm]
export const rehypePlugins = [
  rehypeSlug,
  [rehypePrettyCode, prettyCodeOptions] as const,
]
