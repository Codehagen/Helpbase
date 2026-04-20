import { Check, X } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

type Option = {
    key: "roll-your-own" | "hosted-saas" | "helpbase"
    name: string
    metric: string
    metricSubtitle: string
    body: string
    signals: Array<{ positive: boolean; text: string }>
    cost: string
    costNote?: string
    emphasized?: boolean
}

const options: Option[] = [
    {
        key: "roll-your-own",
        name: "Roll your own",
        metric: "2–3 days",
        metricSubtitle: "to first site",
        body: "Build a docs site from scratch. Burn the weekend wiring up the framework, then another maintaining it.",
        signals: [
            { positive: true, text: "You own every file" },
            { positive: false, text: "No MCP, no llms.txt" },
            { positive: false, text: "No hosted option" },
        ],
        cost: "Your weekend",
    },
    {
        key: "hosted-saas",
        name: "Hosted docs SaaS",
        metric: "1 day",
        metricSubtitle: "to first site",
        body: "Pay a hosted vendor to run your docs. Fast to start. Your content lives in their database. Migrating off is a project.",
        signals: [
            { positive: false, text: "Your docs, their database" },
            { positive: false, text: "MCP is a Pro-tier add-on" },
            { positive: false, text: "Vendor-locked hosting" },
        ],
        cost: "$200–1k",
        costNote: "/ month",
    },
    {
        key: "helpbase",
        name: "Helpbase",
        metric: "3 min",
        metricSubtitle: "to first site",
        body: "Open source. One command drops a full help center, built on shadcn, into your repo. MCP server and llms.txt built in. Host it yourself, or with us.",
        signals: [
            { positive: true, text: "Own every file" },
            { positive: true, text: "MCP + llms.txt built in" },
            { positive: true, text: "Host anywhere, or with us" },
        ],
        cost: "Free or hosted",
        emphasized: true,
    },
]

export default function Comparator() {
    return (
        <section
            aria-labelledby="comparator-heading"
            className="bg-background py-16 md:py-24">
            <div className="mx-auto max-w-5xl px-6">
                <div className="mx-auto mb-12 max-w-2xl text-center">
                    <h2
                        id="comparator-heading"
                        className="text-foreground text-3xl font-semibold md:text-4xl">
                        Two options today. Both are compromises.
                    </h2>
                    <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-balance text-lg">
                        Helpbase is the third option.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {options.map((option) => (
                        <OptionCard
                            key={option.key}
                            option={option}
                        />
                    ))}
                </div>
            </div>
        </section>
    )
}

function OptionCard({ option }: { option: Option }) {
    return (
        <div
            className={cn(
                "ring-border relative flex flex-col rounded-2xl border border-transparent p-6 ring-1",
                option.emphasized
                    ? "bg-card shadow-black/6.5 z-10 shadow-xl"
                    : "bg-card/40",
            )}>
            {option.emphasized && (
                <span className="bg-foreground text-background absolute -top-3 right-6 rounded-full px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider">
                    Recommended
                </span>
            )}

            <div className="text-muted-foreground text-sm font-medium">
                {option.name}
            </div>

            <div className="mt-2">
                <div className="text-foreground text-3xl font-semibold tabular-nums">
                    {option.metric}
                </div>
                <div className="text-muted-foreground text-xs">
                    {option.metricSubtitle}
                </div>
            </div>

            <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
                {option.body}
            </p>

            <ul
                role="list"
                className="mt-5 space-y-2.5 text-sm">
                {option.signals.map((signal, i) => (
                    <li
                        key={i}
                        className="flex items-start gap-2">
                        {signal.positive ? (
                            <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 mt-px flex size-4 shrink-0 items-center justify-center rounded-full">
                                <Check
                                    className="size-2.5"
                                    strokeWidth={3}
                                />
                            </span>
                        ) : (
                            <span className="bg-foreground/10 text-muted-foreground mt-px flex size-4 shrink-0 items-center justify-center rounded-full">
                                <X
                                    className="size-2.5"
                                    strokeWidth={3}
                                />
                            </span>
                        )}
                        <span
                            className={cn(
                                signal.positive
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                            )}>
                            {signal.text}
                        </span>
                    </li>
                ))}
            </ul>

            <div className="border-border/60 mt-6 flex items-baseline gap-1 border-t pt-4">
                <span className="text-foreground text-sm font-medium">
                    {option.cost}
                </span>
                {option.costNote && (
                    <span className="text-muted-foreground text-xs">
                        {option.costNote}
                    </span>
                )}
            </div>
        </div>
    )
}
