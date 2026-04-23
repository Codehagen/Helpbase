"use client"

import { Check, Copy, Terminal as TerminalIcon } from "lucide-react"

import { CopyButton } from "@workspace/ui/components/copy-button"
import { track } from "@/lib/analytics"

/**
 * Copy-enabled install-command row for the /install catalog page.
 *
 * Client-only because CopyButton + the track() analytics call are both
 * client-side. Kept in its own file so the parent route stays a server
 * component for fast first paint — only this small interactive island
 * hydrates.
 */
export function InstallCommand({ command, optionId }: { command: string; optionId: string }) {
  return (
    <div className="bg-muted/50 border-border group relative flex items-center gap-3 rounded-xl border py-1.5 pl-4 pr-1.5">
      <TerminalIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
      <code className="text-foreground flex-1 overflow-x-auto text-left font-mono text-[13px]">
        {command}
      </code>
      <CopyButton
        value={command}
        variant="default"
        size="sm"
        className="rounded-lg px-3 shrink-0"
        aria-label={`Copy install command for ${optionId}`}
        onCopy={() => track("install_catalog_copied", { option: optionId, command })}
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
  )
}
