import { Check, Copy, Globe } from "lucide-react"

export const PreviewUrlCard = () => (
  <div
    aria-hidden
    className="ring-border bg-card relative z-10 mx-auto w-full max-w-sm rounded-xl border border-transparent p-4 shadow-sm ring-1">
    <div className="mb-3 flex items-center gap-2">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-foreground text-xs font-medium">
        Preview ready
      </span>
      <span className="text-muted-foreground ml-auto text-[0.65rem]">
        12s ago
      </span>
    </div>

    <div className="bg-muted/50 ring-border/60 mb-3 flex items-center gap-2 rounded-md px-3 py-2 font-mono text-xs ring-1">
      <Globe className="text-muted-foreground size-3.5 shrink-0" />
      <span className="text-foreground truncate">
        docs-pr-42.helpbase.dev
      </span>
    </div>

    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        className="bg-foreground/5 ring-border/60 text-foreground hover:bg-foreground/10 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 ring-1 transition-colors">
        <Copy className="size-3" />
        Copy link
      </button>
      <div className="text-muted-foreground flex items-center gap-1">
        <Check className="size-3 text-emerald-500" />
        <span>Deploy check passed</span>
      </div>
    </div>
  </div>
)

export default PreviewUrlCard
