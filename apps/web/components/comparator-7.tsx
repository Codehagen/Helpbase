import { cn } from '@workspace/ui/lib/utils'
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const plans = ['rollYourOwn', 'hostedSaas', 'helpbase'] as const

type Plan = (typeof plans)[number]

type Cell = boolean | string

type Feature = {
    name: string
    description?: string
    plans: Record<Plan, Cell>
}

const planLabels: Record<Plan, string> = {
    rollYourOwn: 'Roll your own',
    hostedSaas: 'Hosted SaaS',
    helpbase: 'Helpbase',
}

const features: Feature[] = [
    {
        name: 'Time to first help center',
        description: 'From zero to a live docs site on your domain.',
        plans: { rollYourOwn: '2-3 days', hostedSaas: '1 day', helpbase: '3 min' },
    },
    {
        name: 'You own every file',
        description: 'Code lives in your repo, commits land in your git history.',
        plans: { rollYourOwn: true, hostedSaas: false, helpbase: true },
    },
    {
        name: 'MCP server (agent-consumable docs)',
        description: 'Model Context Protocol endpoint Claude / Cursor / ChatGPT can query.',
        plans: { rollYourOwn: 'DIY', hostedSaas: 'Limited', helpbase: 'Built in' },
    },
    {
        name: 'llms.txt + structured agent output',
        description: 'Discoverability manifest + machine-readable content, by default.',
        plans: { rollYourOwn: false, hostedSaas: false, helpbase: true },
    },
    {
        name: 'Deploy anywhere (Vercel / Fly / self-host)',
        description: 'No platform lock-in. Ship your docs on whatever infra you already use.',
        plans: { rollYourOwn: true, hostedSaas: false, helpbase: true },
    },
    {
        name: 'Cost',
        description: 'Sticker price for a working help center at seed stage.',
        plans: { rollYourOwn: 'Your weekend', hostedSaas: '$200-1k/mo', helpbase: 'Free or hosted' },
    },
    {
        name: 'Maintained without you',
        description: 'Hosted tier handles updates, caching, MCP scaling.',
        plans: { rollYourOwn: false, hostedSaas: true, helpbase: 'Hosted tier' },
    },
    {
        name: 'AI tools can read the docs',
        description: 'Your editor autocompletes from your real docs instead of guessing.',
        plans: { rollYourOwn: 'DIY', hostedSaas: 'Limited', helpbase: true },
    },
]

const renderPlanColumn = (plan: Plan) => {
    const isPrimary = plan === 'helpbase'
    const header = (
        <div className={cn('sticky top-0 flex h-14 flex-col items-center justify-center gap-1.5 px-4 text-center lg:px-6', isPrimary && 'rounded-t-xl')}>
            <span className={cn('text-foreground text-sm font-semibold', isPrimary && 'text-primary')}>{planLabels[plan]}</span>
        </div>
    )

    return (
        <div
            data-plan={plan}
            className={cn(isPrimary && 'ring-border bg-card/50 shadow-black/6.5 relative z-10 rounded-xl shadow-xl ring-1')}>
            {header}

            <div>
                {features.map((feature, index) => {
                    const value = feature.plans[plan]
                    return (
                        <div
                            key={index}
                            className="odd:bg-card flex h-14 items-center justify-center px-4 text-sm last:h-[calc(3.5rem+1px)] last:border-b group-last:odd:rounded-r-lg">
                            <div className="text-center">
                                {value === true ? (
                                    <Indicator checked />
                                ) : value === false ? (
                                    <Indicator />
                                ) : (
                                    <span className={cn('text-muted-foreground text-xs font-medium', isPrimary && 'text-foreground')}>{value}</span>
                                )}
                            </div>
                        </div>
                    )
                })}
                <div className="h-6"></div>
            </div>
        </div>
    )
}

export default function Comparator() {
    return (
        <section
            aria-labelledby="comparator-heading"
            className="bg-background py-16 md:py-24">
            <div className="mx-auto max-w-6xl md:px-6">
                <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
                    <div className="max-w-lg max-md:px-6">
                        <div className="text-balance lg:max-w-xs">
                            <h2
                                id="comparator-heading"
                                className="text-foreground text-3xl font-semibold md:text-4xl">
                                Two options today. Both are compromises.
                            </h2>
                            <p className="text-muted-foreground mt-4 text-balance lg:mt-6">
                                Build your own in Next.js and burn a weekend. Pay a hosted docs SaaS and get locked in. Helpbase is the third option: free as open source, paid only when you want us to host it.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-[1fr_1fr_1fr_1.1fr]">
                        <div>
                            <div className="z-1 sticky top-0 flex h-14 items-end gap-1.5 px-4 py-2 lg:px-6">
                                <div className="text-muted-foreground text-sm font-medium">Feature</div>
                            </div>

                            {features.map((feature, index) => (
                                <div
                                    key={index}
                                    className="text-muted-foreground md:nth-2:rounded-tl-xl even:bg-card flex h-14 items-center gap-1 rounded-l-lg px-4 last:h-[calc(3.5rem+1px)] md:last:rounded-bl-xl lg:px-6">
                                    <div className="text-sm">{feature.name}</div>
                                    {feature.description && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger className="flex size-7">
                                                    <span className="bg-foreground/10 text-foreground/65 m-auto flex size-4 items-center justify-center rounded-full text-sm">?</span>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-56 text-sm">{feature.description}</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                </div>
                            ))}
                        </div>

                        {plans.map((plan) => (
                            <div
                                key={plan}
                                className="group">
                                {renderPlanColumn(plan)}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

const Indicator = ({ checked = false }: { checked?: boolean }) => {
    return (
        <span
            className={cn(
                'mx-auto flex size-4 items-center justify-center rounded-full bg-rose-500 font-sans text-xs font-semibold text-white',
                checked && 'bg-emerald-600 text-white',
            )}>
            {checked ? <CheckIcon /> : '✗'}
        </span>
    )
}

const CheckIcon = () => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 512 512"
            className="size-2.5">
            <path
                fill="currentColor"
                d="M17.47 250.9C88.82 328.1 158 397.6 224.5 485.5c72.3-143.8 146.3-288.1 268.4-444.37L460 26.06C356.9 135.4 276.8 238.9 207.2 361.9c-48.4-43.6-126.62-105.3-174.38-137z"
            />
        </svg>
    )
}
