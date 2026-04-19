'use client'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { CardTitle, CardDescription } from '@/components/ui/card'
import { track } from '@/lib/analytics'

type TierKey = 'self-host' | 'hosted-free' | 'hosted-pro'

export default function Pricing() {
    return (
        <section
            id="pricing"
            aria-labelledby="pricing-heading"
            className="bg-background relative scroll-mt-24 py-16 md:py-32">
            <div className="mx-auto max-w-5xl px-6">
                <div className="mx-auto max-w-2xl text-center">
                    <h2
                        id="pricing-heading"
                        className="text-balance text-3xl font-bold md:text-4xl lg:text-5xl lg:tracking-tight">
                        Free as open source. Paid when you want us to host it.
                    </h2>
                    <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-balance text-lg">
                        Self-host is the wedge. Hosted is the convenience. Pick the one that matches how you want to spend your time.
                    </p>
                </div>
                <div className="@container mt-12">
                    <div className="@4xl:max-w-full mx-auto max-w-sm rounded-xl border">
                        <div className="@4xl:grid-cols-3 grid *:p-8">
                            <div className="@max-4xl:p-9 row-span-4 grid grid-rows-subgrid gap-8">
                                <div className="self-end">
                                    <CardTitle className="text-lg font-medium">Self-host</CardTitle>
                                    <CardDescription className="text-muted-foreground mt-1 text-balance text-sm">Own the code forever. Ship it yourself.</CardDescription>
                                </div>
                                <div>
                                    <div className="text-3xl font-semibold">Free</div>
                                    <div className="text-muted-foreground text-sm">MIT license, no strings</div>
                                </div>
                                <Button
                                    asChild
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => track('pricing_tier_clicked', { tier: 'self-host' satisfies TierKey })}>
                                    <Link
                                        href="https://github.com/Codehagen/helpbase"
                                        target="_blank"
                                        rel="noreferrer">
                                        Get started on GitHub
                                    </Link>
                                </Button>
                                <ul
                                    role="list"
                                    className="space-y-3 text-sm">
                                    {[
                                        'pnpm dlx create-helpbase scaffold',
                                        'MDX + shadcn/ui in your repo',
                                        'MCP server runs on your infra',
                                        'llms.txt auto-generated',
                                        'Deploy to Vercel / Fly / self-host',
                                        'MIT license, your code forever',
                                    ].map((item) => (
                                        <li
                                            key={item}
                                            className="flex items-center gap-2">
                                            <Check
                                                className="text-muted-foreground size-3"
                                                strokeWidth={3.5}
                                            />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="ring-border bg-card rounded-(--radius) @4xl:my-2 @max-4xl:mx-1 shadow-black/6.5 row-span-4 grid grid-rows-subgrid gap-8 shadow-xl ring-1 backdrop-blur">
                                <div className="self-end">
                                    <CardTitle className="text-lg font-medium">Hosted free</CardTitle>
                                    <CardDescription className="text-muted-foreground mt-1 text-balance text-sm">Skip the infra. One command to live.</CardDescription>
                                </div>
                                <div>
                                    <div className="text-3xl font-semibold">
                                        $0<span className="text-muted-foreground text-base font-normal">/mo</span>
                                    </div>
                                    <div className="text-muted-foreground text-sm">Up to 1 site, fair-use limits</div>
                                </div>
                                <Button
                                    asChild
                                    className="w-full"
                                    onClick={() => track('pricing_tier_clicked', { tier: 'hosted-free' satisfies TierKey })}>
                                    <Link href="/login">Deploy now</Link>
                                </Button>
                                <ul
                                    role="list"
                                    className="space-y-3 text-sm">
                                    {[
                                        'Everything in Self-host, plus:',
                                        'helpbase deploy to {slug}.helpbase.dev',
                                        'Hosted MCP endpoint we run',
                                        'Edge-cached llms.txt + content',
                                        'Zero-config SSL + CDN',
                                        'Migrate to self-host any time',
                                    ].map((item) => (
                                        <li
                                            key={item}
                                            className="group flex items-center gap-2 first:font-medium">
                                            <Check
                                                className="text-muted-foreground size-3 group-first:hidden"
                                                strokeWidth={3.5}
                                            />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="@max-4xl:p-9 row-span-4 grid grid-rows-subgrid gap-8">
                                <div className="self-end">
                                    <CardTitle className="text-lg font-medium">Pro</CardTitle>
                                    <CardDescription className="text-muted-foreground mt-1 text-balance text-sm">For teams shipping real docs together.</CardDescription>
                                </div>
                                <div>
                                    <div className="text-3xl font-semibold">Coming soon</div>
                                    <div className="text-muted-foreground text-sm">Pricing with the first 10 teams</div>
                                </div>
                                <Button
                                    asChild
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => track('pricing_tier_clicked', { tier: 'hosted-pro' satisfies TierKey })}>
                                    <Link href="/login">Join the Pro waitlist</Link>
                                </Button>
                                <ul
                                    role="list"
                                    className="space-y-3 text-sm">
                                    {[
                                        'Everything in Hosted free, plus:',
                                        'Custom domain (docs.yourco.com)',
                                        'Team members and roles',
                                        'Analytics and AI usage dashboards',
                                        'Higher hosted MCP rate limits',
                                        'Priority support + SLA',
                                    ].map((item) => (
                                        <li
                                            key={item}
                                            className="group flex items-center gap-2 first:font-medium">
                                            <Check
                                                className="text-muted-foreground size-3 group-first:hidden"
                                                strokeWidth={3.5}
                                            />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
