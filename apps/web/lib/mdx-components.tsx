type MDXComponents = Record<string, React.ComponentType<any>>
import { Callout } from "@/components/mdx/callout"
import { Figure } from "@/components/mdx/figure"
import { Video } from "@/components/mdx/video"
import { Steps, Step } from "@/components/mdx/steps"
import { Accordion, AccordionItem } from "@/components/mdx/accordion"
import { Tabs, Tab } from "@/components/mdx/tabs"
import { CardGroup, Card } from "@/components/mdx/card-group"
import { CtaCard } from "@/components/mdx/cta-card"

/**
 * Creates an MDX component map bound to a specific article's context.
 *
 * The category and slug are needed by Figure, Video, and CtaCard to
 * resolve relative asset paths (e.g. "hero.png" → "/_helpbase-assets/cat/slug/hero.png").
 * Without this binding, relative paths in MDX body would 404.
 *
 * The img override routes markdown images ![](path) through Figure
 * so they get the same asset resolution as <Figure src="path">.
 */
export function createArticleComponents(category: string, slug: string): MDXComponents {
  return {
    Callout,
    Figure: (props) => <Figure {...props} category={category} slug={slug} />,
    Video: (props) => <Video {...props} category={category} slug={slug} />,
    CtaCard: (props) => <CtaCard {...props} category={category} slug={slug} />,
    Steps,
    Step,
    Accordion,
    AccordionItem,
    Tabs,
    Tab,
    CardGroup,
    Card,

    // Prose overrides — route markdown images through Figure resolver
    img: (props) => (
      <Figure
        src={props.src || ""}
        alt={props.alt || ""}
        category={category}
        slug={slug}
      />
    ),

    // Enhanced table wrapper for horizontal scroll
    table: (props) => (
      <div className="my-6 overflow-x-auto rounded-lg border border-border">
        <table {...props} />
      </div>
    ),
  }
}
