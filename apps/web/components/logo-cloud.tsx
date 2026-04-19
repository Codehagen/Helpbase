import { Beacon } from '@/components/ui/svgs/beacon'
import { Bolt } from '@/components/ui/svgs/bolt'
import { Cisco } from '@/components/ui/svgs/cisco'
import { Hulu } from '@/components/ui/svgs/hulu'
import { OpenAIFull } from '@/components/ui/svgs/open-ai'
import { Primevideo } from '@/components/ui/svgs/prime'
import { Stripe } from '@/components/ui/svgs/stripe'
import { VisualStudioCode } from '@/components/ui/svgs/vs-code'
import { InfiniteSlider } from '@/components/ui/infinite-slider'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function LogoCloud() {
    return (
        <section className="overflow-hidden py-16">
            <div className="group relative m-auto max-w-5xl px-6">
                <div className="text-center">
                    <div className="mx-auto max-w-xl text-balance">
                        <h2 className="text-4xl font-semibold">You're in good company</h2>
                        <p className="text-muted-foreground mt-4 text-lg">Tailark is trusted by innovative companies worldwide to deliver exceptional products and services that drive business growth.</p>
                    </div>

                    <div className="mask-x-from-90% relative py-12">
                        <div
                            aria-hidden
                            className="mask-r-from-50% backdrop-grayscale-200 absolute inset-y-0 left-0 z-10 w-16"
                        />
                        <div
                            aria-hidden
                            className="mask-l-from-50% backdrop-grayscale-200 absolute inset-y-0 right-0 z-10 w-16"
                        />
                        <InfiniteSlider
                            speedOnHover={20}
                            speed={40}
                            className="*:gap-12! md:*:gap-24! lg:*:gap-32! items-center">
                            <Hulu
                                height={24}
                                width="auto"
                            />
                            <Beacon
                                height={24}
                                width="auto"
                            />
                            <Cisco
                                height={24}
                                width="auto"
                            />
                            <Primevideo
                                height={32}
                                width="auto"
                            />
                            <Stripe
                                height={24}
                                width="auto"
                            />
                            <OpenAIFull
                                height={24}
                                width="auto"
                            />
                            <VisualStudioCode
                                height={24}
                                width="auto"
                            />

                            <Bolt
                                height={24}
                                width="auto"
                            />
                        </InfiniteSlider>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="pr-2">
                        <Link href="#">
                            Read customer stories
                            <ChevronRight className="size-3.5!" />
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    )
}