import { Children, isValidElement } from "react"

export function Steps({ children }: { children: React.ReactNode }) {
  const steps = Children.toArray(children).filter(
    (child): child is React.ReactElement<{ title?: string; children?: React.ReactNode }> =>
      isValidElement(child) && (child as React.ReactElement).type === Step,
  )

  return (
    <div className="my-8" role="list">
      {steps.map((child, i) => {
        if (!isValidElement(child)) return null
        return (
          <div key={i} className="relative flex gap-4 pb-8 last:pb-0" role="listitem">
            {/* Number + connecting line */}
            <div className="relative flex flex-col items-center">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background text-sm font-semibold">
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className="absolute top-8 bottom-0 w-0.5 bg-border" />
              )}
            </div>
            {/* Content */}
            <div className="min-w-0 flex-1 pt-1">
              {child.props.title && (
                <h4 className="mb-2 font-semibold">{child.props.title}</h4>
              )}
              <div className="text-sm text-muted-foreground [&>p:last-child]:mb-0">
                {child.props.children}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Step({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  // Rendered by Steps parent — this is a data component
  return null
}

// Mark Step so Steps can identify it
Step.displayName = "Step"
