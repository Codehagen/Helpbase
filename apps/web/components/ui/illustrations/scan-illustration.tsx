'use client'
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { TextScramble } from '@/components/ui/text-scramble'
import { cn } from '@workspace/ui/lib/utils'
import { LightDarkParticles } from "@/components/particles"
import { ShieldCheck, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'

export const ScanIllustration = () => {
    const [show, setShow] = useState(false)
    const [showName, setShowName] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => {
            setShow(true)

            const hideTimer = setTimeout(() => {
                setShow(false)
                setShowName(true)
            }, 100)

            return () => clearTimeout(hideTimer)
        }, 4000)

        return () => clearTimeout(timer)
    }, [])
    return (
        <div
            aria-hidden
            className="bg-illustration ring-border-illustration shadow-black/6.5 flex flex-col items-center justify-center rounded-2xl border border-transparent p-8 shadow-md ring-1">
            <div className="flex size-8 rounded-full border border-dashed">
                <ShieldCheck className="text-muted-foreground m-auto size-4" />
            </div>
            <div className="group relative m-auto size-fit scale-90">
                <div
                    className="mask-[radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] absolute -inset-6 z-10 opacity-15 mix-blend-overlay"
                    style={{
                        backgroundImage: `
        linear-gradient(to right, #000 1px, transparent 1px),
        linear-gradient(to bottom, #000 1px, transparent 1px)
      `,
                        backgroundSize: '5px 5px',
                    }}
                />

                <div className="absolute inset-0 animate-spin opacity-50 blur-lg duration-[3s] dark:opacity-20">
                    <div className="bg-linear-to-r/increasing animate-hue-rotate absolute inset-0 rounded-full from-pink-300 to-indigo-300" />
                </div>
                <div className="animate-scan absolute inset-x-12 inset-y-0 z-10">
                    <div className="absolute inset-x-0 m-auto h-6 rounded-full bg-white/50 blur-2xl" />
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 1.5, type: 'spring' }}
                    className="aspect-2/3 w-22 absolute inset-0 z-10 m-auto">
                    <CardDecorator className="scale-125 border-white blur-[3px]" />
                    <motion.div
                        initial={{ '--frame-color': 'white' }}
                        animate={{ '--frame-color': 'var(--color-lime-400)' }}
                        transition={{ duration: 0.4, delay: 3.5, type: 'spring' }}>
                        <CardDecorator className="border-(--frame-color) z-10" />
                    </motion.div>
                    <LightDarkParticles id="light-dark-particles" />
                </motion.div>

                {show && <div className="absolute inset-0 z-10 scale-150 rounded-full bg-white mix-blend-overlay blur-xl" />}

                <div className="bg-radial aspect-square max-w-xs [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] group-hover:opacity-95">
                    <Image
                        src="https://res.cloudinary.com/dohqjvu9k/image/upload/v1767530872/human-face_kf9mt7.png"
                        alt="woman face"
                        className="bg-illustration size-full object-cover grayscale"
                        width={560}
                        height={560}
                    />
                </div>

                <div
                    aria-hidden
                    className="absolute inset-x-0 bottom-4 z-10 mx-auto flex h-4 justify-center">
                    {showName && <TextScramble className="text-center font-mono text-sm uppercase text-white">Anna Johnson</TextScramble>}
                </div>
            </div>
            <Button
                variant="outline"
                size="sm"
                className="mx-auto mb-4 rounded-full">
                <User className="!size-3" />
                Upload Image
            </Button>
        </div>
    )
}

export const CardDecorator = ({ className }: { className?: string }) => (
    <>
        <span className={cn('absolute -left-px -top-px block size-2.5 border-l-[1.5px] border-t-[1.5px] border-white', className)}></span>
        <span className={cn('absolute -right-px -top-px block size-2.5 border-r-[1.5px] border-t-[1.5px] border-white', className)}></span>
        <span className={cn('absolute -bottom-px -left-px block size-2.5 border-b-[1.5px] border-l-[1.5px] border-white', className)}></span>
        <span className={cn('absolute -bottom-px -right-px block size-2.5 border-b-[1.5px] border-r-[1.5px] border-white', className)}></span>
    </>
)