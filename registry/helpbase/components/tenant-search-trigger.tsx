"use client"

/**
 * Search trigger button for tenant subdomains.
 *
 * Visually matches the apex SearchTrigger inlined in components/header.tsx
 * but is its own component so the tenant layout (server component) can
 * mount it without pulling in the whole apex header's theme-toggle and
 * nav logic, which belong to helpbase.dev itself, not tenant pages.
 *
 * The ⌘K shortcut is owned by SearchDialog's global keydown listener;
 * this button just simulates that keydown so mouse users get the same
 * effect as keyboard users.
 */
export function TenantSearchTrigger() {
  return (
    <button
      type="button"
      className="group flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-[border-color,background-color] duration-150 ease hover:border-foreground/20 hover:bg-muted/60 sm:w-64"
      onClick={() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "k",
            metaKey: true,
            bubbles: true,
          }),
        )
      }}
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <span className="flex-1 text-left">Search articles...</span>
      <kbd className="pointer-events-none hidden h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
        <span className="text-xs">&#8984;</span>K
      </kbd>
    </button>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  )
}
