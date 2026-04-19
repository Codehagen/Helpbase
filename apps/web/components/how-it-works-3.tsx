import { MonitoringBarChart } from "@/components/ui/illustrations/monitoring-barchart-illustration"
import { ScanIllustration } from "@/components/ui/illustrations/scan-illustration"
import { cn } from '@workspace/ui/lib/utils'
import { CodeIllustration } from "@/components/ui/illustrations/code-illustration"
import Image from 'next/image'

const GLODIE_AVATAR = 'https://avatars.githubusercontent.com/u/99137927?v=4'

export default function FeaturesSection() {
    return (
        <section className="bg-background overflow-hidden">
            <div className="mx-auto max-w-5xl px-6 py-24 xl:px-0">
                <div className="@container relative">
                    <PlusDecorator className="-translate-[calc(50%-0.5px)]" />
                    <PlusDecorator className="right-0 -translate-y-[calc(50%-0.5px)] translate-x-[calc(50%-0.5px)]" />
                    <PlusDecorator className="bottom-0 right-0 translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
                    <PlusDecorator className="bottom-0 -translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
                    <div className="@3xl:grid-cols-3 @3xl:divide-x grid grid-cols-1 border">
                        <div className="@4xl:p-12 @xl:p-8 w-full p-6">
                            <h2 className="text-foreground mb-6 text-3xl font-semibold">Set up your pipeline in minutes</h2>
                            <p className="text-muted-foreground text-lg">Our powerful analytics platform helps you visualize complex data, identify trends, and make data-driven decisions with confidence.</p>
                        </div>

                        <div className="@4xl:*:p-12 @xl:*:p-8 relative col-span-2 divide-y *:p-6">
                            <div className="group space-y-6">
                                <div>
                                    <span className="bg-foreground/5 text-foreground flex size-7 items-center justify-center rounded-full text-sm font-medium">1</span>
                                    <h3 className="text-foreground my-4 text-lg font-semibold">Collaborative Analysis</h3>
                                    <p className="text-muted-foreground">Add comments, share insights, and work together with your team to extract maximum. From real-time dashboards to custom reports, we've got your data needs covered.</p>
                                </div>

                                <MonitoringBarChart />
                            </div>
                            <div className="group space-y-6">
                                <div>
                                    <span className="bg-foreground/5 text-foreground flex size-7 items-center justify-center rounded-full text-sm font-medium">2</span>
                                    <h3 className="text-foreground my-4 text-lg font-semibold">Send Invoice</h3>
                                    <p className="text-muted-foreground">Add comments, share insights, and work together with your team to extract maximum. From real-time dashboards to custom reports, we've got your data needs covered.</p>
                                </div>

                                <ScanIllustration />
                            </div>
                            <div className="group space-y-6">
                                <div>
                                    <span className="bg-foreground/5 text-foreground flex size-7 items-center justify-center rounded-full text-sm font-medium">3</span>
                                    <h3 className="text-foreground my-4 text-lg font-semibold">Send Invoice</h3>
                                    <p className="text-muted-foreground">Add comments, share insights, and work together with your team to extract maximum. From real-time dashboards to custom reports, we've got your data needs covered.</p>
                                </div>

                                <CodeIllustration />

                                <blockquote className="before:bg-primary relative mt-12 max-w-xl pl-4 before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-full">
                                    <p>It's the perfect fusion of simplicity and versatility, enabling us to create UIs that are as stunning as they are user-friendly.</p>

                                    <div className="mt-6 flex items-center gap-2">
                                        <div className="bg-background size-6 rounded-full border p-0.5 shadow shadow-zinc-950/5">
                                            <Image
                                                className="aspect-square rounded-full object-cover"
                                                src={GLODIE_AVATAR}
                                                alt="Glodie"
                                                height="46"
                                                width="46"
                                            />
                                        </div>
                                        <span>Glodie Lukose</span>
                                        <span className="text-muted-foreground">@glodie</span>
                                    </div>
                                </blockquote>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

const PlusDecorator = ({ className }: { className?: string }) => (
    <div
        aria-hidden
        className={cn('mask-radial-from-15% before:bg-foreground/25 after:bg-foreground/25 absolute size-3 before:absolute before:inset-0 before:m-auto before:h-px after:absolute after:inset-0 after:m-auto after:w-px', className)}
    />
)