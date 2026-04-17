type MDXComponents = Record<string, React.ComponentType<any>>
import { Callout } from "@/components/mdx/callout"
import { Figure } from "@/components/mdx/figure"
import { Video } from "@/components/mdx/video"
import { Steps, Step } from "@/components/mdx/steps"
import { Accordion, AccordionItem } from "@/components/mdx/accordion"
import { Tabs, Tab } from "@/components/mdx/tabs"
import { CardGroup, Card } from "@/components/mdx/card-group"
import { CtaCard } from "@/components/mdx/cta-card"

const BLOCKED_PROTOCOLS = /^(javascript|data|vbscript):/i
const EVENT_HANDLER_RE = /^on[A-Z]/

/**
 * Sanitize props for hosted (untrusted) MDX content.
 * Strips javascript: URIs and event handlers.
 */
function sanitizeProps<T extends Record<string, unknown>>(props: T): T {
  const clean = { ...props }
  for (const [key, value] of Object.entries(clean)) {
    // Block event handlers (onClick, onError, etc.)
    if (EVENT_HANDLER_RE.test(key)) {
      delete (clean as Record<string, unknown>)[key]
      continue
    }
    // Block dangerous URI schemes in href/src/action
    if (
      (key === "href" || key === "src" || key === "action") &&
      typeof value === "string" &&
      BLOCKED_PROTOCOLS.test(value.trim())
    ) {
      delete (clean as Record<string, unknown>)[key]
    }
  }
  return clean
}

/**
 * Creates an MDX component map for hosted tenant content.
 * Same components as self-hosted, but with prop sanitization for security.
 */
export function createHostedArticleComponents(
  category: string,
  slug: string,
  tenantSlug: string
): MDXComponents {
  return {
    Callout: (props) => <Callout {...sanitizeProps(props)} />,
    Figure: (props) => (
      <Figure {...sanitizeProps(props)} category={category} slug={slug} />
    ),
    Video: (props) => (
      <Video {...sanitizeProps(props)} category={category} slug={slug} />
    ),
    CtaCard: (props) => (
      <CtaCard {...sanitizeProps(props)} category={category} slug={slug} />
    ),
    Steps,
    Step,
    Accordion: (props) => <Accordion {...sanitizeProps(props)} />,
    AccordionItem: (props) => <AccordionItem {...sanitizeProps(props)} />,
    Tabs,
    Tab,
    CardGroup,
    Card: (props) => <Card {...sanitizeProps(props)} />,

    // Prose overrides with sanitization
    a: (props) => {
      const clean = sanitizeProps(props)
      return <a {...clean} rel="noopener noreferrer" />
    },
    img: (props) => {
      const clean = sanitizeProps(props)
      return (
        <Figure
          src={clean.src || ""}
          alt={clean.alt || ""}
          category={category}
          slug={slug}
        />
      )
    },

    // Block potentially dangerous elements in hosted content
    script: () => null,
    iframe: () => null,
    object: () => null,
    embed: () => null,
    form: () => null,

    // Enhanced table wrapper
    table: (props) => (
      <div className="my-6 overflow-x-auto rounded-lg border border-border">
        <table {...props} />
      </div>
    ),

    // See mdx-components.tsx for the rationale — article template renders
    // the title as h1 already, so a body `# Title` would produce a second h1.
    // Downgrade to h2 to keep the document outline clean.
    h1: (props) => <h2 {...sanitizeProps(props)} />,
  }
}
