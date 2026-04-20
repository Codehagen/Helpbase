'use client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import React from 'react'
import { useScroll, useMotionValueEvent } from 'motion/react'
import { Menu, X, ArrowRight } from 'lucide-react'
import { useMedia } from '@/hooks/use-media'
import { cn } from '@workspace/ui/lib/utils'

interface NavLink {
    name: string
    href: string
    external?: boolean
}

const NAV_LINKS: NavLink[] = [
    { name: 'Docs', href: '/docs' },
    { name: 'Pricing', href: '/#pricing' },
    { name: 'GitHub', href: 'https://github.com/Codehagen/helpbase', external: true },
]

export function Header() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
    const [isScrolled, setIsScrolled] = React.useState(false)
    const isLarge = useMedia('(min-width: 64rem)')

    const { scrollY } = useScroll()

    useMotionValueEvent(scrollY, 'change', (latest) => {
        setIsScrolled(latest > 5)
    })

    return (
        <header
            role="banner"
            data-state={isMobileMenuOpen ? 'active' : 'inactive'}
            {...(isScrolled && { 'data-scrolled': true })}>
            <div
                className={cn(
                    'in-data-scrolled:bg-background fixed inset-x-0 top-0 z-50 border-b',
                    !isLarge && 'h-14 overflow-hidden border-b',
                    isMobileMenuOpen && 'bg-background h-screen',
                )}>
                <div className="mx-auto max-w-5xl px-6">
                    <div className="relative flex flex-wrap items-center justify-between lg:py-3">
                        <div className="flex justify-between gap-8 max-lg:h-14 max-lg:w-full max-lg:border-b">
                            <Link
                                href="/"
                                aria-label="helpbase home"
                                className="flex items-center text-lg font-semibold tracking-tight text-foreground">
                                helpbase
                            </Link>

                            {isLarge && (
                                <nav
                                    aria-label="Primary"
                                    className="absolute inset-0 m-auto size-fit">
                                    <ul className="flex items-center gap-6">
                                        {NAV_LINKS.map((link) => (
                                            <li key={link.name}>
                                                <Link
                                                    href={link.href}
                                                    {...(link.external && {
                                                        target: '_blank',
                                                        rel: 'noreferrer',
                                                    })}
                                                    className="text-muted-foreground hover:text-foreground inline-flex items-center py-2 text-sm font-medium transition-colors">
                                                    {link.name}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </nav>
                            )}

                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                                className="relative z-20 -m-2.5 -mr-3 block cursor-pointer p-2.5 lg:hidden">
                                <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-5 duration-200" />
                                <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-5 -rotate-180 scale-0 opacity-0 duration-200" />
                            </button>
                        </div>

                        {!isLarge && isMobileMenuOpen && (
                            <MobileMenu closeMenu={() => setIsMobileMenuOpen(false)} />
                        )}

                        <div className="max-lg:in-data-[state=active]:mt-6 in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end gap-3 space-y-8 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
                            <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="rounded-full">
                                <Link href="/login">Sign in</Link>
                            </Button>
                            <Button
                                asChild
                                size="sm"
                                className="rounded-full pr-2.5">
                                <Link href="/login">
                                    <span>Deploy now</span>
                                    <span className="*:size-3! shadow-xs bg-primary-foreground/20 ring-primary-foreground/30 text-primary-foreground flex size-5 rounded-full ring-1 *:m-auto">
                                        <ArrowRight className="size-4" />
                                    </span>
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    )
}

const MobileMenu = ({ closeMenu }: { closeMenu: () => void }) => {
    return (
        <nav
            aria-label="Mobile primary"
            className="w-full">
            <ul className="-mx-4 mt-0.5 space-y-0.5">
                {NAV_LINKS.map((link) => (
                    <li key={link.name}>
                        <Link
                            href={link.href}
                            {...(link.external && {
                                target: '_blank',
                                rel: 'noreferrer',
                            })}
                            onClick={closeMenu}
                            className="group relative flex items-center justify-between border-0 border-b px-4 py-4 text-lg">
                            <span>{link.name}</span>
                            {link.external && (
                                <span
                                    aria-hidden
                                    className="text-muted-foreground text-xs">
                                    ↗
                                </span>
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    )
}
