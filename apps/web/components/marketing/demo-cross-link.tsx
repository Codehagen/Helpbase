"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { track } from "@/lib/analytics"

export function DemoCrossLink() {
  return (
    <section
      aria-labelledby="demo-heading"
      className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="ring-border bg-card/60 relative overflow-hidden rounded-2xl border border-transparent shadow-md shadow-black/5 ring-1">
          <div className="grid gap-8 p-10 md:grid-cols-[1.2fr_1fr] md:p-14">
            <div>
              <h2
                id="demo-heading"
                className="text-foreground text-3xl font-semibold md:text-4xl">
                See a real helpbase site. Running right now.
              </h2>
              <p className="text-muted-foreground mt-4 max-w-lg text-balance">
                demo.helpbase.dev is a live helpbase deployment with real MDX
                content, a working MCP server, and an llms.txt you can curl.
                Point Claude Code or Cursor at{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-sm">
                  demo.helpbase.dev/api/mcp
                </code>{" "}
                and watch it ground on the docs.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full">
                  <Link
                    href="https://demo.helpbase.dev"
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => track("demo_opened")}>
                    Open the live demo
                    <span aria-hidden>↗</span>
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="lg"
                  className="rounded-full">
                  <Link
                    href="https://demo.helpbase.dev/llms.txt"
                    target="_blank"
                    rel="noreferrer">
                    Curl the llms.txt
                  </Link>
                </Button>
              </div>
            </div>
            <div
              aria-hidden
              className="bg-muted/40 ring-border relative hidden min-h-56 overflow-hidden rounded-xl ring-1 md:block">
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="text-muted-foreground w-full space-y-2 text-left font-mono text-xs">
                  <div>
                    <span className="text-primary">$</span> curl
                    demo.helpbase.dev/llms.txt
                  </div>
                  <div className="pl-2 opacity-90"># Helpbase demo docs</div>
                  <div className="pl-2 opacity-90">
                    Docs: https://demo.helpbase.dev/docs
                  </div>
                  <div className="pl-2 opacity-90">
                    MCP: https://demo.helpbase.dev/api/mcp
                  </div>
                  <div className="pl-2 opacity-70">## Articles</div>
                  <div className="pl-2 opacity-70">- getting-started</div>
                  <div className="pl-2 opacity-70">- mcp-integration</div>
                  <div className="pl-2 opacity-70">- deploy-preview</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
