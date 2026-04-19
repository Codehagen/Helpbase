import { cn } from '@workspace/ui/lib/utils'
import { CodeIllustration } from "@/components/ui/illustrations/code-illustration"
import { DocumentIllustation } from "@/components/ui/illustrations/document-illustration"
import { WorkflowIllustration } from "@/components/illustrations/workflow"

const steps = [
    {
        title: "Install",
        body: "Run pnpm dlx create-helpbase in your repo. You get a Next.js app with shadcn/ui, MDX content, an MCP server, and an llms.txt. Every file is yours.",
        visual: <CodeIllustration />,
    },
    {
        title: "Preview",
        body: "pnpm dev runs it locally. helpbase deploy --preview pushes a draft to a shareable URL without touching your production site.",
        visual: <DocumentIllustation />,
    },
    {
        title: "Deploy",
        body: "Push to helpbase.dev with one command, or deploy the same files to Vercel, Fly, or your own server. Same content, same MCP endpoint, your choice of host.",
        visual: <WorkflowIllustration />,
    },
]

export default function HowItWorks() {
    return (
        <section
            aria-labelledby="how-it-works-heading"
            className="bg-background overflow-hidden">
            <div className="mx-auto max-w-5xl px-6 py-24">
                <div className="@container relative">
                    <PlusDecorator className="-translate-[calc(50%-0.5px)]" />
                    <PlusDecorator className="right-0 -translate-y-[calc(50%-0.5px)] translate-x-[calc(50%-0.5px)]" />
                    <PlusDecorator className="bottom-0 right-0 translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
                    <PlusDecorator className="bottom-0 -translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
                    <div className="@3xl:grid-cols-3 @3xl:divide-x grid grid-cols-1 border">
                        <div className="@4xl:p-12 @xl:p-8 w-full p-6">
                            <h2
                                id="how-it-works-heading"
                                className="text-foreground mb-6 text-3xl font-semibold md:text-4xl">
                                From zero to live in three commands.
                            </h2>
                            <p className="text-muted-foreground text-lg">
                                No hosted CMS. No lock-in. Your docs are plain MDX files in your git history from day one.
                            </p>
                        </div>

                        <div className="@4xl:*:p-12 @xl:*:p-8 relative col-span-2 divide-y *:p-6">
                            {steps.map((step, index) => (
                                <div
                                    key={step.title}
                                    className="group space-y-6">
                                    <div>
                                        <span className="bg-foreground/5 text-foreground flex size-7 items-center justify-center rounded-full text-sm font-medium">
                                            {index + 1}
                                        </span>
                                        <h3 className="text-foreground my-4 text-lg font-semibold">{step.title}</h3>
                                        <p className="text-muted-foreground">{step.body}</p>
                                    </div>
                                    {step.visual}
                                </div>
                            ))}
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
        className={cn(
            'mask-radial-from-15% before:bg-foreground/25 after:bg-foreground/25 absolute size-3 before:absolute before:inset-0 before:m-auto before:h-px after:absolute after:inset-0 after:m-auto after:w-px',
            className,
        )}
    />
)
