'use client'
import { GeminiFull } from '@/components/ui/svgs/gemini'
import { Beacon } from '@/components/ui/svgs/beacon'
import { Bolt } from '@/components/ui/svgs/bolt'
import { Cisco } from '@/components/ui/svgs/cisco'
import { Hulu } from '@/components/ui/svgs/hulu'
import { OpenAIFull } from '@/components/ui/svgs/open-ai'
import { Primevideo } from '@/components/ui/svgs/prime'
import { Stripe } from '@/components/ui/svgs/stripe'
import { Supabase } from '@/components/ui/svgs/supabase'
import { Polars } from '@/components/ui/svgs/polars'
import { AnimatePresence, motion } from 'motion/react'
import React, { useEffect, useState } from 'react'
import { Cloudflare } from '@/components/ui/svgs/cloudflare'
import { VercelFull } from '@/components/ui/svgs/vercel'
import { Spotify } from '@/components/ui/svgs/spotify'
import { PayPal } from '@/components/ui/svgs/paypal'
import { LeapWallet } from '@/components/ui/svgs/leap-wallet'
import { Linear } from '@/components/ui/svgs/linear'
import { Slack } from '@/components/ui/svgs/slack'
import { Twilio } from '@/components/ui/svgs/twilio'
import { cn } from '@workspace/ui/lib/utils'

const aiLogos: React.ReactNode[] = [
    <OpenAIFull
        key="openai"
        height={24}
        width="auto"
    />,
    <Bolt
        key="bolt"
        height={20}
        width="auto"
    />,
    <GeminiFull
        key="gemini"
        height={24}
        width="auto"
        className="-translate-y-0.5"
    />,
]

const hostingLogos: React.ReactNode[] = [
    <Supabase
        key="supabase"
        height={24}
        width="auto"
    />,
    <Cloudflare
        key="cloudflare"
        height={24}
        width="auto"
    />,
    <VercelFull
        key="vercel"
        height={20}
        width="auto"
    />,
]

const paymentsLogos: React.ReactNode[] = [
    <Stripe
        key="stripe"
        height={24}
        width="auto"
    />,
    <PayPal
        key="paypal"
        height={24}
        width="auto"
    />,
    <LeapWallet
        key="leapwallet"
        height={24}
        width="auto"
    />,
]

const streamingLogos: React.ReactNode[] = [
    <Primevideo
        key="primevideo"
        height={28}
        width="auto"
    />,
    <Hulu
        key="hulu"
        height={22}
        width="auto"
    />,
    <Spotify
        key="spotify"
        height={24}
        width="auto"
    />,
]

const otherLogos: React.ReactNode[] = [
    <Cisco
        key="cisco"
        height={32}
        width="auto"
    />,
    <Beacon
        key="beacon"
        height={20}
        width="auto"
    />,
    <Polars
        key="polars"
        height={24}
        width="auto"
    />,
]

const toolsLogos: React.ReactNode[] = [
    <Linear
        key="linear"
        height={24}
        width="auto"
    />,
    <Slack
        key="slack"
        height={24}
        width="auto"
    />,
    <Twilio
        key="twilio"
        height={24}
        width="auto"
    />,
]

const logoGroups = [aiLogos, hostingLogos, paymentsLogos, streamingLogos, otherLogos, toolsLogos]

export function LogoCloud() {
    const [logoIndices, setLogoIndices] = useState([0, 0, 0, 0, 0, 0])

    useEffect(() => {
        let wrapperIndex = 0
        const interval = setInterval(() => {
            setLogoIndices((prev) => {
                const groupLogos = logoGroups[wrapperIndex]
                if (!groupLogos) return prev
                const newIndices = [...prev]
                newIndices[wrapperIndex] = ((newIndices[wrapperIndex] ?? 0) + 1) % groupLogos.length
                return newIndices
            })
            wrapperIndex = (wrapperIndex + 1) % logoGroups.length
        }, 2000)

        return () => clearInterval(interval)
    }, [])

    return (
        <section className="bg-background">
            <div className="relative mx-auto max-w-6xl px-6 py-16">
                <div
                    aria-hidden
                    className="*:corner-bevel absolute inset-0 grid grid-cols-3 gap-px *:border-x *:via-transparent *:first:border-l-0 *:last:rounded-r-[2rem] *:last:border-r-0 md:grid-cols-6">
                    <div />
                    <div className="max-md:hidden" />
                    <div className="max-md:hidden" />
                    <div className="max-md:hidden" />
                    <div />
                    <div />
                </div>
                <div className="grid grid-cols-3 gap-y-6 md:grid-cols-6">
                    <LogoWrapper
                        logos={aiLogos}
                        group="ai"
                        logoIndex={logoIndices[1]}
                    />
                    <LogoWrapper
                        logos={hostingLogos}
                        group="hosting"
                        logoIndex={logoIndices[3]}
                    />
                    <LogoWrapper
                        logos={paymentsLogos}
                        group="payments"
                        logoIndex={logoIndices[0]}
                    />
                    <LogoWrapper
                        logos={streamingLogos}
                        group="streaming"
                        logoIndex={logoIndices[4]}
                    />
                    <LogoWrapper
                        logos={otherLogos}
                        group="other"
                        logoIndex={logoIndices[2]}
                    />
                    <LogoWrapper
                        logos={toolsLogos}
                        group="tools"
                        logoIndex={logoIndices[5]}
                    />
                </div>
            </div>
        </section>
    )
}

const LogoWrapper = ({ logos, group, logoIndex = 0, className }: { logos: React.ReactNode[]; group?: string; logoIndex?: number; className?: string }) => {
    return (
        <div className={cn('relative h-10', className)}>
            <AnimatePresence
                mode="popLayout"
                initial={false}>
                <motion.div
                    key={`${group}-${logoIndex}`}
                    initial={{ opacity: 0, scale: 0.75, y: -24, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.75, y: 24, filter: 'blur(6px)' }}
                    transition={{ duration: 0.5 }}
                    className="**:fill-foreground/75! absolute inset-0 flex *:m-auto">
                    {logos[logoIndex]}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}