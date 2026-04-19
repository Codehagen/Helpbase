import React from 'react'
import { Header } from "@/components/header"
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ProductIllustration } from "@/components/ui/illustrations/product-illustration"
import { LogoCloud } from "@/components/logo-cloud"
import Image from 'next/image'
import { ChevronRight } from 'lucide-react'

export default function HeroSection() {
    return (
        <>
            <Header />
            <main
                role="main"
                className="bg-background overflow-hidden">
                <section className="selection:bg-primary-foreground selection:text-primary relative">
                    <div className="pt-15">
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-10 mx-auto max-w-6xl border-x"
                        />
                        <div
                            aria-hidden
                            className="top-15 corner-bevel max-w-332 pointer-events-none absolute inset-0 inset-x-0 z-10 mx-auto rounded-t-[2rem] border-x border-t"
                        />
                        <div
                            aria-hidden
                            className="max-w-316 h-15 pointer-events-none absolute inset-0 inset-x-0 z-10 mx-auto border-x"
                        />
                        <div className="flex justify-center">
                            <div className="relative flex flex-wrap items-center justify-center gap-3 p-4">
                                <div className="bg-foreground text-background rounded-full px-2 py-1 text-xs">New</div>
                                <Link
                                    href="https://github.com/Codehagen/helpbase"
                                    className="group flex items-center gap-2 text-sm after:absolute after:inset-0">
                                    Open source, live today
                                    <ChevronRight className="not-group-hover:opacity-50 size-4" />
                                </Link>
                            </div>
                        </div>
                        <div className="corner-t-notch relative z-10 mx-auto grid max-w-6xl rounded-t-[2rem] border-x border-t px-6 py-16 max-md:pb-6">
                            <div className="mx-auto max-w-3xl text-center">
                                <h1 className="text-foreground text-balance font-serif text-4xl leading-[1.1] tracking-[-0.5px] md:text-5xl">Docs your AI agent can actually use.</h1>

                                <p className="text-muted-foreground mb-6 mt-4 text-balance text-lg">Helpbase turns your repo into an AI-native knowledge layer. One command gives you an MCP server, an llms.txt, and a Next.js help center generated from your code. You own every file.</p>

                                <Button
                                    asChild
                                    size="lg"
                                    className="rounded-full px-6 shadow-transparent">
                                    <Link href="https://demo.helpbase.dev">See the live demo</Link>
                                </Button>
                            </div>
                        </div>
                        <div className="relative -mt-px border-y">
                            <div className="mask-t-from-25% absolute inset-0">
                                <Image
                                    src="https://images.unsplash.com/photo-1695151992691-a9e19f73948f?q=80&w=2206&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                                    alt=""
                                    aria-hidden
                                    className="size-full object-cover object-top dark:opacity-25"
                                    width={1920}
                                    height={1080}
                                    priority
                                />
                            </div>
                            <div className="relative mx-auto max-w-6xl overflow-hidden py-6 md:py-16">
                                <div
                                    aria-hidden
                                    className="absolute inset-0 grid grid-cols-3 gap-px *:border-x *:first:border-l-0 *:last:border-r-0 md:grid-cols-6">
                                    <div />
                                    <div className="max-md:hidden" />
                                    <div className="max-md:hidden" />
                                    <div className="max-md:hidden" />
                                    <div />
                                    <div />
                                </div>
                                <div
                                    aria-hidden
                                    className="*:bg-linear-to-l *:from-foreground/6.5 *:to-foreground/6.5 mask-t-from-65% absolute inset-0 grid grid-cols-3 gap-px *:via-transparent md:grid-cols-6">
                                    <div />
                                    <div className="max-md:hidden" />
                                    <div className="max-md:hidden" />
                                    <div className="max-md:hidden" />
                                    <div />
                                    <div />
                                </div>

                                <ProductIllustration />
                            </div>
                        </div>
                    </div>
                    <LogoCloud />
                </section>
            </main>
        </>
    )
}