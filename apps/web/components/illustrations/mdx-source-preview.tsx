export const MdxSourcePreview = () => (
  <div
    aria-hidden
    className="ring-border bg-card relative z-10 mx-auto w-full max-w-sm rounded-xl border border-transparent p-4 font-mono text-xs ring-1">
    <div className="text-muted-foreground mb-3 text-[0.65rem] uppercase tracking-wider">
      content/getting-started.mdx
    </div>
    <div className="space-y-1.5">
      <div className="text-muted-foreground">---</div>
      <div>
        <span className="text-muted-foreground">title:</span>{" "}
        <span className="text-foreground">Getting started</span>
      </div>
      <div>
        <span className="text-muted-foreground">order:</span>{" "}
        <span className="text-foreground">1</span>
      </div>
      <div className="text-muted-foreground">---</div>
      <div className="h-1.5" />
      <div className="text-foreground"># Install helpbase</div>
      <div className="h-1.5" />
      <div className="text-muted-foreground">
        Run one command in your repo to
      </div>
      <div className="text-muted-foreground">
        create a full Next.js help center.
      </div>
      <div className="h-1.5" />
      <div className="text-primary">{`<Callout type="tip">`}</div>
      <div className="pl-3 text-muted-foreground">
        Edit this file to add your own content.
      </div>
      <div className="text-primary">{`</Callout>`}</div>
    </div>
  </div>
)

export default MdxSourcePreview
