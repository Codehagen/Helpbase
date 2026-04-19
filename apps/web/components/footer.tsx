import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 text-sm text-muted-foreground sm:flex-row">
        <p>
          Built with{" "}
          <Link
            href="/docs"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            helpbase
          </Link>
        </p>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Codehagen/helpbase"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <span className="text-border">|</span>
          <a
            href="https://x.com/CodeHagen"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Twitter
          </a>
        </div>
      </div>
    </footer>
  )
}
