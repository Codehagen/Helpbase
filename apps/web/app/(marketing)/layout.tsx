/**
 * Marketing layout — intentionally bare. The (marketing) route group
 * stays out of the docs UX (no sidebar, no SearchDialog, no Footer
 * with docs links). Marketing pages own their own header + footer
 * via the components they install (e.g. Tailark blocks).
 *
 * Global html/body/ThemeProvider come from app/layout.tsx.
 */
export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
