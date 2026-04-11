import Link from "next/link"

export default function TenantNotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-bold tracking-tight">
        Help center not found
      </h1>
      <p className="mt-3 text-muted-foreground">
        This subdomain hasn't been set up yet.
      </p>
      <a
        href="https://helpbase.dev"
        className="mt-6 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Create your help center
      </a>
    </div>
  )
}
