"use client"

import Link from "next/link"
import { Check, Copy, Terminal as TerminalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  AnimatedSpan,
  Terminal,
  TypingAnimation,
} from "@/components/ui/terminal"
import { CopyButton } from "@workspace/ui/components/copy-button"
import { track } from "@/lib/analytics"

const INSTALL_COMMAND = "pnpm dlx create-helpbase"

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="selection:bg-primary-foreground selection:text-primary relative">
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

        {/* Announcement pill */}
        <div className="flex justify-center">
          <div className="relative flex flex-wrap items-center justify-center gap-3 p-4">
            <div className="bg-foreground text-background rounded-full px-2 py-1 text-xs">
              New
            </div>
            <Link
              href="https://github.com/Codehagen/helpbase"
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-2 text-sm after:absolute after:inset-0">
              Open source, shipped today
              <span
                aria-hidden
                className="not-group-hover:opacity-50 text-xs">
                →
              </span>
            </Link>
          </div>
        </div>

        <div className="corner-t-notch relative z-10 mx-auto grid max-w-6xl gap-8 rounded-t-[2rem] border-x border-t px-6 py-16 max-md:pb-10">
          <div className="mx-auto max-w-3xl text-center">
            <h1
              id="hero-heading"
              className="text-foreground text-balance text-4xl font-medium leading-[1.05] tracking-[-0.02em] md:text-6xl">
              Docs are infrastructure now.
              <br className="hidden md:block" />{" "}
              <span className="text-muted-foreground">Helpbase ships the code.</span>
            </h1>

            <p className="text-muted-foreground mx-auto mb-8 mt-4 max-w-2xl text-balance text-lg">
              An MCP server, an{" "}
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-base">llms.txt</code>, and a full Next.js help center, scaffolded into your repo in 30 seconds. Your product&apos;s interface to AI agents, as code you own. Self-host forever, or deploy to us with one command.
            </p>

            {/* Dual CTA: install command + demo */}
            <div className="mx-auto flex max-w-xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <div className="bg-muted/50 border-border group relative flex items-center gap-3 rounded-full border py-1.5 pl-5 pr-1.5">
                <TerminalIcon
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
                <code className="text-foreground text-left text-sm font-medium tabular-nums">
                  {INSTALL_COMMAND}
                </code>
                <CopyButton
                  value={INSTALL_COMMAND}
                  variant="default"
                  size="sm"
                  className="rounded-full px-3"
                  aria-label="Copy install command"
                  onCopy={() =>
                    track("hero_install_copied", { command: INSTALL_COMMAND })
                  }
                  copiedLabel={
                    <>
                      <Check className="size-4" />
                      <span>Copied</span>
                    </>
                  }>
                  <Copy className="size-4" />
                  <span>Copy</span>
                </CopyButton>
              </div>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="rounded-full px-5">
                <Link
                  href="https://demo.helpbase.dev"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track("hero_demo_clicked")}>
                  See the live demo
                  <span
                    aria-hidden
                    className="text-muted-foreground ml-1">
                    →
                  </span>
                </Link>
              </Button>
            </div>
          </div>

          {/* Terminal canvas */}
          <div className="mx-auto w-full max-w-2xl">
            <HeroTerminal />
          </div>
        </div>

        {/* Bottom strip (logo cloud slot handled by <BuiltOn />) */}
      </div>
    </section>
  )
}

function HeroTerminal() {
  return (
    <Terminal className="mx-auto w-full max-w-2xl shadow-sm">
      <TypingAnimation className="text-muted-foreground">
        {`$ ${INSTALL_COMMAND}`}
      </TypingAnimation>
      <AnimatedSpan className="text-foreground">
        ◇ Help center scaffolded into ./help-center
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground">
        ◇ MDX content, shadcn/ui, MCP server, llms.txt
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground">
        ◇ Installing dependencies (parallel)…
      </AnimatedSpan>
      <AnimatedSpan className="text-foreground">
        ◇ Ready. Next steps:
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground pl-4">
        cd help-center && pnpm dev
      </AnimatedSpan>
      <TypingAnimation className="text-primary">
        → Live preview: docs-a1b2c3.helpbase.dev
      </TypingAnimation>
    </Terminal>
  )
}
