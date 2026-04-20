import { FileText, Lightbulb } from "lucide-react"

export const MdxSourcePreview = () => (
  <div
    aria-hidden
    className="ring-border bg-card relative z-10 mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-transparent ring-1">
    <div className="border-border/60 bg-muted/40 flex items-center justify-between gap-2 border-b px-3.5 py-2">
      <div className="flex items-center gap-1.5">
        <FileText className="text-muted-foreground size-3" />
        <span className="text-muted-foreground font-mono text-[0.65rem] uppercase tracking-wider">
          getting-started.mdx
        </span>
      </div>
      <span className="text-emerald-600 dark:text-emerald-400 text-[0.6rem] font-medium uppercase tracking-wider">
        Source
      </span>
    </div>

    <div className="space-y-1.5 p-4 font-mono text-xs leading-relaxed">
      <div className="text-muted-foreground/80">---</div>
      <div>
        <span className="text-violet-600 dark:text-violet-400">title:</span>{" "}
        <span className="text-foreground">Install helpbase</span>
      </div>
      <div>
        <span className="text-violet-600 dark:text-violet-400">order:</span>{" "}
        <span className="text-amber-600 dark:text-amber-400">1</span>
      </div>
      <div className="text-muted-foreground/80">---</div>
      <div className="h-1" />
      <div>
        <span className="text-foreground"># Install helpbase</span>
      </div>
      <div className="text-muted-foreground">
        Run one command to get started.
      </div>
      <div className="h-1" />
      <div>
        <span className="text-sky-600 dark:text-sky-400">{"<Callout"}</span>{" "}
        <span className="text-violet-600 dark:text-violet-400">type</span>
        <span className="text-muted-foreground">=</span>
        <span className="text-emerald-600 dark:text-emerald-400">"tip"</span>
        <span className="text-sky-600 dark:text-sky-400">{">"}</span>
      </div>
      <div className="text-muted-foreground pl-3">
        Edit and ship.
      </div>
      <div className="text-sky-600 dark:text-sky-400">{"</Callout>"}</div>
    </div>

    <div className="border-border/60 bg-background/60 border-t px-4 py-3">
      <div className="text-muted-foreground mb-2 text-[0.6rem] font-medium uppercase tracking-wider">
        Rendered
      </div>
      <div className="text-foreground mb-1 text-base font-semibold leading-tight">
        Install helpbase
      </div>
      <div className="text-muted-foreground mb-2.5 text-xs leading-relaxed">
        Run one command to get started.
      </div>
      <div className="ring-amber-500/25 bg-amber-500/10 flex items-start gap-2 rounded-md px-2.5 py-2 ring-1">
        <Lightbulb
          aria-hidden
          className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-400"
          strokeWidth={2.5}
        />
        <span className="text-foreground text-xs leading-snug">
          Edit and ship.
        </span>
      </div>
    </div>
  </div>
)

export default MdxSourcePreview
