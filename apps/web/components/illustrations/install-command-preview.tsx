export const InstallCommandPreview = () => (
  <div
    aria-hidden
    className="ring-border bg-card relative z-10 mx-auto w-full max-w-sm rounded-xl border border-transparent p-4 font-mono text-xs ring-1">
    <div className="mb-3 flex items-center gap-1.5">
      <span className="size-2.5 rounded-full bg-red-400/70" />
      <span className="size-2.5 rounded-full bg-amber-400/70" />
      <span className="size-2.5 rounded-full bg-emerald-400/70" />
    </div>

    <div className="space-y-1">
      <div>
        <span className="text-muted-foreground">$ </span>
        <span className="text-foreground">pnpm dlx create-helpbase</span>
      </div>
      <div className="text-foreground">
        <span className="text-emerald-500">◇</span> Help center created at{" "}
        <span className="text-muted-foreground">./help-center</span>
      </div>
      <div className="text-muted-foreground pl-4">
        MDX, shadcn/ui, MCP server, llms.txt
      </div>
      <div className="text-muted-foreground">
        <span className="text-emerald-500">◇</span> Installing dependencies…
      </div>
      <div className="text-foreground">
        <span className="text-emerald-500">◇</span> Ready.{" "}
        <span className="text-muted-foreground">Next:</span>{" "}
        <span className="text-primary">cd help-center && pnpm dev</span>
      </div>
    </div>
  </div>
)

export default InstallCommandPreview
