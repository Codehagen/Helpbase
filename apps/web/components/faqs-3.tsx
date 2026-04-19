import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import Link from 'next/link'

const faqItems = [
    {
        group: 'General',
        items: [
            {
                id: 'gen-1',
                question: 'Is helpbase open source?',
                answer: 'Yes, MIT-licensed on GitHub. The CLI writes a real Next.js app straight into your repo. Every file is yours to edit, commit, fork, and deploy anywhere.',
            },
            {
                id: 'gen-2',
                question: 'How is this different from a hosted docs SaaS?',
                answer: 'You own every file. Your docs are code in your git history, not rows in someone else\'s database. MCP and llms.txt are free and built in, not a Pro-tier add-on.',
            },
            {
                id: 'gen-3',
                question: 'What framework does it use?',
                answer: 'Next.js 14 App Router + shadcn/ui + MDX. A standard stack, nothing proprietary. If you already build with Next.js, you already know it.',
            },
        ],
    },
    {
        group: 'Hosted tier',
        items: [
            {
                id: 'host-1',
                question: 'Can I migrate off the hosted tier?',
                answer: 'Yes. The hosted tier runs the exact same MDX + config that create-helpbase put in your repo. Clone your repo, deploy the Next.js app anywhere, done. We built it so you can leave.',
            },
            {
                id: 'host-2',
                question: 'What is on the free hosted tier vs Pro?',
                answer: 'Hosted free gets you one site at {slug}.helpbase.dev with a hosted MCP endpoint we run, edge caching, and SSL. Pro adds custom domain, team members and roles, analytics, higher MCP rate limits, and priority support.',
            },
            {
                id: 'host-3',
                question: 'Where is data stored on the hosted tier?',
                answer: 'Supabase (Postgres + edge functions), plus Vercel edge runtime for serving content and the MCP endpoint. Your MDX source is always in your own git repo, the hosted tier just serves a build of it.',
            },
        ],
    },
    {
        group: 'MCP & AI',
        items: [
            {
                id: 'mcp-1',
                question: 'Does the MCP server work with Claude Code and Cursor?',
                answer: 'Yes, over standard Model Context Protocol. The CLI prints the URL. Point your editor at it. Autocomplete and chat answer from your real docs from that moment on.',
            },
            {
                id: 'mcp-2',
                question: 'What do you mean by AI built in?',
                answer: 'Every site includes an llms.txt and an MCP server by default. The MCP exposes typed tool calls for list, read, and search. No scraping, no lock-in, no Pro-tier upsell.',
            },
            {
                id: 'mcp-3',
                question: 'Do I need an AI key to use it?',
                answer: 'No. The install CLI does not call external AI APIs. Optional features like helpbase sync (which proposes doc edits from code changes) use your own provider keys.',
            },
        ],
    },
]

export default function FAQs() {
    return (
        <section
            id="faq"
            aria-labelledby="faq-heading"
            className="bg-background scroll-mt-24 py-16 md:py-24">
            <div className="mx-auto max-w-5xl px-1 md:px-6">
                <div className="grid max-md:gap-8 md:grid-cols-5 md:divide-x md:border">
                    <div className="max-w-lg max-md:px-6 md:col-span-2 md:p-10 lg:p-12">
                        <h2
                            id="faq-heading"
                            className="text-foreground text-3xl font-semibold md:text-4xl">
                            FAQs
                        </h2>
                        <p className="text-muted-foreground mt-4 text-balance text-lg">The questions founders ask before running the install.</p>
                        <p className="text-muted-foreground mt-6 max-md:hidden">
                            Still stuck? Open an issue on{' '}
                            <Link
                                href="https://github.com/Codehagen/helpbase/issues"
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary font-medium hover:underline">
                                GitHub
                            </Link>
                            .
                        </p>
                    </div>

                    <div className="space-y-12 md:col-span-3 md:px-4 md:pb-4 md:pt-10 lg:pt-12">
                        {faqItems.map((group) => (
                            <div
                                className="space-y-4"
                                key={group.group}>
                                <h3 className="text-foreground pl-6 text-lg font-semibold">{group.group}</h3>
                                <Accordion
                                    type="single"
                                    collapsible
                                    className="-space-y-1">
                                    {group.items.map((item) => (
                                        <AccordionItem
                                            key={item.id}
                                            value={item.id}
                                            className="data-[state=open]:bg-card data-[state=open]:ring-border data-[state=open]:shadow-black/6.5 group peer rounded-xl border-none px-6 py-1 data-[state=open]:border-none data-[state=open]:shadow-sm data-[state=open]:ring-1">
                                            <AccordionTrigger className="not-group-last:border-b cursor-pointer rounded-none text-base transition-none hover:no-underline data-[state=open]:border-transparent hover:[&>svg]:translate-y-1 hover:data-[state=open]:[&>svg]:translate-y-0">
                                                {item.question}
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <p className="text-muted-foreground text-base">{item.answer}</p>
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="text-muted-foreground mt-12 px-6 md:hidden">
                    Still stuck? Open an issue on{' '}
                    <Link
                        href="https://github.com/Codehagen/helpbase/issues"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary font-medium hover:underline">
                        GitHub
                    </Link>
                    .
                </p>
            </div>
        </section>
    )
}
