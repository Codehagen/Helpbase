import { CurrencyIllustration } from "@/components/ui/illustrations/currency-illustration"
import { ReplyIllustration } from "@/components/ui/illustrations/reply-illustration"
import { NotificationIllustration } from "@/components/ui/illustrations/notification-illustration"
import { Card } from '@/components/ui/card'
import { MapIllustration } from "@/components/ui/illustrations/map-illustration"
import { VisualizationIllustration } from "@/components/ui/illustrations/visualization-illustration"

export default function AiNativeBento() {
    return (
        <section
            aria-labelledby="ai-native-heading"
            className="@container bg-background py-24">
            <div className="mx-auto w-full max-w-5xl px-6">
                <div className="mb-12 text-center">
                    <h2
                        id="ai-native-heading"
                        className="text-foreground text-3xl font-semibold md:text-4xl">
                        AI-native by default. Not an upsell.
                    </h2>
                    <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-balance text-lg">
                        Every helpbase site ships an MCP server and an llms.txt out of the box, so Claude, Cursor, and ChatGPT can ground on your docs without you paying for it later.
                    </p>
                </div>
                <div className="not-dark:*:bg-card/50 @xl:grid-cols-2 @3xl:grid-cols-6 grid gap-3">
                    <Card className="@3xl:col-span-2 grid grid-rows-[1fr_auto] gap-y-12 overflow-hidden rounded-2xl p-8">
                        <div className="relative -m-8 p-8">
                            <Stripes />
                            <NotificationIllustration
                                variant="mixed"
                                className="*:!rounded-2xl"
                            />
                        </div>
                        <div>
                            <h3 className="text-foreground font-semibold">MCP server, built in</h3>
                            <p className="text-muted-foreground mt-3">
                                Model Context Protocol endpoint ships with every helpbase site. Point Claude Code or Cursor at the URL and they query your real docs instead of hallucinating.
                            </p>
                        </div>
                    </Card>
                    <Card className="@3xl:col-span-2 grid grid-rows-[1fr_auto] gap-y-12 overflow-hidden rounded-2xl p-8">
                        <div className="relative -m-8 p-8">
                            <Stripes />
                            <CurrencyIllustration />
                        </div>
                        <div>
                            <h3 className="text-foreground font-semibold">llms.txt out of the box</h3>
                            <p className="text-muted-foreground mt-3">
                                Agent-discoverability manifest generated on every build, served at /llms.txt. The spec agents already look for, without you remembering to add it.
                            </p>
                        </div>
                    </Card>
                    <Card className="@xl:col-span-2 grid grid-rows-[1fr_auto] gap-y-12 overflow-hidden rounded-2xl p-8">
                        <div className="relative -m-8 p-8">
                            <Stripes />
                            <ReplyIllustration className="relative mt-0 w-full" />
                        </div>
                        <div>
                            <h3 className="text-foreground font-semibold">Structured agent output</h3>
                            <p className="text-muted-foreground mt-3">
                                The MCP server exposes your content as typed tool calls: list articles, read a specific slug, search. No scraping, no guesswork.
                            </p>
                        </div>
                    </Card>
                    <Card className="@xl:col-span-2 @3xl:col-span-3 grid grid-rows-[1fr_auto] gap-8 rounded-2xl p-8">
                        <div className="-m-8 p-8">
                            <VisualizationIllustration />
                        </div>
                        <div>
                            <h3 className="text-foreground font-semibold">Code-grounded doc sync</h3>
                            <p className="text-muted-foreground mt-3">
                                helpbase sync reads your source code and proposes MDX diffs grounded in the actual functions and types. You review, you merge. AI assists, it does not author.
                            </p>
                        </div>
                    </Card>
                    <Card className="@xl:col-span-2 @3xl:col-span-3 grid grid-rows-[1fr_auto] gap-8 rounded-2xl p-8">
                        <div className="relative -mx-8 [--color-background:transparent] [mask-image:radial-gradient(ellipse_50%_45%_at_50%_50%,#000_70%,transparent_100%)]">
                            <MapIllustration />
                        </div>
                        <div>
                            <h3 className="text-foreground font-semibold">Hosted tier, if you want it</h3>
                            <p className="text-muted-foreground mt-3">
                                helpbase deploy pushes the same app to {'{'}slug{'}'}.helpbase.dev with zero infra. Hosted MCP at scale, custom domain, team roles, analytics when you upgrade.
                            </p>
                        </div>
                    </Card>
                </div>
            </div>
        </section>
    )
}

const Stripes = () => (
    <div
        aria-hidden
        className="opacity-3 absolute -inset-x-6 inset-y-0 bg-[repeating-linear-gradient(-45deg,var(--color-foreground),var(--color-foreground)_1px,transparent_1px,transparent_6px)] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"
    />
)
