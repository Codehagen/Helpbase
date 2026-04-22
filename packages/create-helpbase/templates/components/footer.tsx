import { Button } from '@/components/ui/button'
import Link from 'next/link'

import {
    MADE_WITH_SHADCN_LABEL,
    MADE_WITH_SHADCN_URL,
    SHADCN_TAGLINE,
} from '@/lib/tagline'

const links = [
    {
        group: 'Product',
        items: [
            { title: 'Pricing', href: '/#pricing' },
            { title: 'Demo', href: '#' },
            { title: 'FAQ', href: '/#faq' },
        ],
    },
    {
        group: 'Resources',
        items: [
            { title: 'Docs', href: '/docs' },
            { title: 'GitHub', href: '#' },
            { title: 'MCP', href: '/docs/mcp' },
        ],
    },
    {
        group: 'Company',
        items: [
            { title: 'Changelog', href: '#' },
            { title: 'License', href: '#' },
            { title: 'Privacy', href: '/docs/privacy' },
        ],
    },
]

export default function FooterSection() {
    return (
        <footer
            role="contentinfo"
            className="bg-background pt-8 sm:pt-20">
            <div className="mx-auto max-w-5xl space-y-16 px-6">
                <div className="flex flex-wrap justify-between gap-6">
                    <div className="max-w-xs space-y-6 md:col-span-2">
                        <Link
                            href="/"
                            aria-label="helpbase home"
                            className="text-foreground block size-fit text-lg font-semibold tracking-tight">
                            helpbase
                        </Link>

                        <p className="text-muted-foreground text-balance text-sm">
                            {SHADCN_TAGLINE} Open-source help centers with MCP + llms.txt built in. Self-host, or deploy with us.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <Link
                            href={MADE_WITH_SHADCN_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={MADE_WITH_SHADCN_LABEL}
                            className="ring-foreground/10 bg-card text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1 text-xs shadow-sm ring-1 transition-colors">
                            <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
                            {MADE_WITH_SHADCN_LABEL}
                        </Link>
                        <Link
                            href='#'
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="GitHub"
                            className="text-muted-foreground hover:text-primary block">
                            <svg
                                className="size-5"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor">
                                <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.94c.57.1.78-.25.78-.55v-2.1c-3.2.7-3.87-1.37-3.87-1.37-.52-1.34-1.27-1.7-1.27-1.7-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.5 3.17-1.18 3.17-1.18.64 1.59.23 2.76.12 3.05.74.82 1.18 1.86 1.18 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.13v3.17c0 .31.21.67.79.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
                            </svg>
                        </Link>
                        <Link
                            href='#'
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="X/Twitter"
                            className="text-muted-foreground hover:text-primary block">
                            <svg
                                className="size-5"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M10.488 14.651L15.25 21h7l-7.858-10.478L20.93 3h-2.65l-5.117 5.886L8.75 3h-7l7.51 10.015L2.32 21h2.65zM16.25 19L5.75 5h2l10.5 14z"
                                />
                            </svg>
                        </Link>
                    </div>
                </div>
                <div
                    aria-hidden
                    className="h-px bg-[length:6px_1px] bg-repeat-x opacity-25 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)]"
                />
                <div className="grid gap-12 md:grid-cols-5">
                    <div className="grid gap-6 sm:grid-cols-3 md:col-span-3">
                        {links.map((group) => (
                            <div
                                key={group.group}
                                className="space-y-4 text-sm">
                                <span className="block font-medium">{group.group}</span>

                                <div className="flex flex-wrap gap-4 sm:flex-col">
                                    {group.items.map((item) => (
                                        <Link
                                            key={item.title}
                                            href={item.href}
                                            {...(item.href.startsWith('http') && {
                                                target: '_blank',
                                                rel: 'noreferrer',
                                            })}
                                            className="text-muted-foreground hover:text-primary block duration-150">
                                            <span>{item.title}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="md:col-span-2">
                        <div className="ml-auto w-full space-y-4 md:max-w-xs">
                            <div className="block text-sm font-medium">Stay in the loop</div>
                            <div className="flex gap-2">
                                <Button
                                    asChild
                                    variant="outline"
                                    size="sm">
                                    <Link
                                        href='#'
                                        target="_blank"
                                        rel="noreferrer">
                                        Follow on GitHub Releases
                                        <span
                                            aria-hidden
                                            className="text-muted-foreground ml-1">
                                            ↗
                                        </span>
                                    </Link>
                                </Button>
                            </div>
                            <p className="text-muted-foreground text-xs">
                                Release notes and shipped features, straight from the repo. No newsletter inbox to opt out of.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap justify-between gap-4 border-t py-8">
                    <span className="text-muted-foreground text-sm">
                        © {new Date().getFullYear()} helpbase. Built with helpbase.
                    </span>
                    <div className="ring-foreground/5 bg-card flex items-center gap-2 rounded-full border border-transparent py-1 pl-2 pr-4 shadow ring-1">
                        <div className="relative flex size-3">
                            <span className="duration-1500 absolute inset-0 block size-full animate-pulse rounded-full bg-emerald-100"></span>
                            <span className="relative m-auto block size-1 rounded-full bg-emerald-500"></span>
                        </div>
                        <span className="text-sm">All systems normal</span>
                    </div>
                </div>
            </div>
        </footer>
    )
}

export { FooterSection as Footer }
