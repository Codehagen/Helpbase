"use client"

import * as React from "react"

import { Button, type buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { type VariantProps } from "class-variance-authority"

type CopyState = "idle" | "copied" | "error"

export interface CopyButtonProps
  extends Omit<React.ComponentProps<"button">, "onCopy">,
    VariantProps<typeof buttonVariants> {
  value: string
  onCopy?: (value: string) => void
  copiedDuration?: number
  asChild?: boolean
  children?: React.ReactNode
  copiedLabel?: React.ReactNode
}

async function writeToClipboard(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      /* fall through to execCommand fallback */
    }
  }

  if (typeof document === "undefined") return false

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  textarea.style.pointerEvents = "none"
  document.body.appendChild(textarea)
  textarea.select()

  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}

export function CopyButton({
  value,
  onCopy,
  copiedDuration = 2000,
  className,
  variant,
  size,
  asChild,
  children,
  copiedLabel,
  onClick,
  ...rest
}: CopyButtonProps) {
  const [state, setState] = React.useState<CopyState>("idle")
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event)
    if (event.defaultPrevented) return

    const ok = await writeToClipboard(value)

    if (ok) {
      onCopy?.(value)
      setState("copied")
    } else {
      setState("error")
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setState("idle"), copiedDuration)
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      variant={variant}
      size={size}
      asChild={asChild}
      data-copy-state={state}
      aria-live="polite"
      className={cn(className)}
      {...rest}>
      {state === "copied" && copiedLabel ? copiedLabel : children}
    </Button>
  )
}
