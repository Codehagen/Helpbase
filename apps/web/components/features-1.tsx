import { FlowIllustration } from "@/components/illustrations/flow"
import { MdxSourcePreview } from "@/components/illustrations/mdx-source-preview"

export default function FeaturesOwnIt() {
    return (
        <section
            aria-labelledby="features-own-heading"
            className="bg-background @container py-24">
            <div className="mx-auto max-w-5xl px-6">
                <div className="text-center mb-12">
                    <h2
                        id="features-own-heading"
                        className="text-foreground text-3xl font-semibold md:text-4xl">
                        Every file is yours, from the first commit.
                    </h2>
                    <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-balance text-lg">
                        Helpbase doesn&apos;t store your content anywhere. The CLI writes a real help center, built on shadcn, straight into your git history. Every edit is a commit. Every file is yours.
                    </p>
                </div>
                <div className="ring-border @4xl:grid-cols-2 @max-4xl:divide-y @4xl:divide-x bg-card/50 relative grid overflow-hidden rounded-2xl border border-transparent shadow-md shadow-black/5 ring-1">
                    <div className="row-span-2 grid grid-rows-subgrid gap-8">
                        <div className="px-8 pt-8">
                            <h3 className="text-balance text-lg font-semibold">MDX all the way down</h3>
                            <p className="text-muted-foreground mt-3">
                                Every article is a plain .mdx file in help-center/content. Import React components, version control every change, diff in PR review.
                            </p>
                        </div>
                        <div className="self-end px-8 pb-8">
                            <MdxSourcePreview />
                        </div>
                    </div>
                    <div className="row-span-2 grid grid-rows-subgrid gap-8">
                        <div className="relative z-10 px-8 pt-8">
                            <h3 className="text-balance text-lg font-semibold">Zero vendor runtime</h3>
                            <p className="text-muted-foreground mt-3">
                                No hosted CMS, no editorial database, no cloud to migrate off if we disappear. Deploy the same repo anywhere.
                            </p>
                        </div>
                        <div className="self-end px-8 pb-8">
                            <FlowIllustration />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
