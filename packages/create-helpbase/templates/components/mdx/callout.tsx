import { Info, Lightbulb, TriangleAlert, OctagonX } from "lucide-react"

const CALLOUT_CONFIG = {
  note: {
    icon: Info,
    label: "Note",
    borderColor: "border-l-blue-500",
    bg: "bg-blue-50/50 dark:bg-blue-950/30",
  },
  tip: {
    icon: Lightbulb,
    label: "Tip",
    borderColor: "border-l-emerald-500",
    bg: "bg-emerald-50/50 dark:bg-emerald-950/30",
  },
  warning: {
    icon: TriangleAlert,
    label: "Warning",
    borderColor: "border-l-amber-500",
    bg: "bg-amber-50/50 dark:bg-amber-950/30",
  },
  danger: {
    icon: OctagonX,
    label: "Danger",
    borderColor: "border-l-red-500",
    bg: "bg-red-50/50 dark:bg-red-950/30",
  },
} as const

export function Callout({
  type = "note",
  children,
}: {
  type?: keyof typeof CALLOUT_CONFIG
  children: React.ReactNode
}) {
  const config = CALLOUT_CONFIG[type]
  const Icon = config.icon

  return (
    <div
      role={type === "danger" ? "alert" : "note"}
      className={`my-6 flex gap-3 rounded-xl border-l-4 ${config.borderColor} ${config.bg} p-4`}
    >
      <div className="flex w-12 shrink-0 flex-col items-center pt-0.5">
        <Icon className="size-4 text-current" />
        <span className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-wider">
          {config.label}
        </span>
      </div>
      <div className="min-w-0 flex-1 text-sm [&>p:last-child]:mb-0">
        {children}
      </div>
    </div>
  )
}
