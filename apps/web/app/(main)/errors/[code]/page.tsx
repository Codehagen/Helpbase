import Link from "next/link"
import { notFound } from "next/navigation"

/**
 * Dynamic error documentation pages. Each known CLI error code has a slug
 * here matching the code lowercased with underscores → hyphens. The
 * `HelpbaseError.docUrl()` helper in packages/cli/src/lib/errors.ts builds
 * URLs that resolve here.
 */

interface ErrorDoc {
  code: string
  title: string
  summary: string
  causes: string[]
  fixes: string[]
  seeAlso?: Array<{ label: string; href: string }>
}

const ERRORS: Record<string, ErrorDoc> = {
  "e-no-content-dir": {
    code: "E_NO_CONTENT_DIR",
    title: "No content/ directory found",
    summary:
      "You ran a content command (deploy, audit, new, add) outside a helpbase project.",
    causes: [
      "You're in the wrong directory — the CLI looks for content/ at the current working directory.",
      "This project hasn't been scaffolded yet.",
      "The content/ directory was renamed or deleted.",
    ],
    fixes: [
      "cd into your helpbase project root and try again.",
      "Run `npx create-helpbase my-help-center` to scaffold a new project.",
      "Pass `--dir <path>` to point the command at a custom content directory.",
    ],
  },
  "e-no-articles": {
    code: "E_NO_ARTICLES",
    title: "No articles to deploy",
    summary: "content/ exists but contains no .mdx files.",
    causes: [
      "You just scaffolded a project and haven't added content yet.",
      "All articles are outside a category subdirectory (they must live in content/<category>/article.mdx).",
    ],
    fixes: [
      "Run `helpbase new` to add an article interactively.",
      "Run `helpbase generate --url <your-site>` to AI-generate articles from your site.",
    ],
  },
  "e-invalid-frontmatter": {
    code: "E_INVALID_FRONTMATTER",
    title: "Invalid article frontmatter",
    summary:
      "One or more articles have frontmatter that doesn't match the content schema.",
    causes: [
      "Missing required fields: schemaVersion, title, or description.",
      "A field has the wrong type (e.g. tags not a list).",
      "Frontmatter YAML has a syntax error.",
    ],
    fixes: [
      "Run `helpbase audit` locally to see the full list before deploying.",
      "See the content schema reference for the exact contract.",
    ],
    seeAlso: [
      { label: "Content schema", href: "https://github.com/Codehagen/helpbase/blob/main/docs/content-schema.md" },
    ],
  },
  "e-not-logged-in": {
    code: "E_NOT_LOGGED_IN",
    title: "Not logged in",
    summary:
      "This command needs a helpbase cloud session and couldn't find one.",
    causes: [
      "You've never logged in on this machine.",
      "Your session expired and refresh failed.",
      "HELPBASE_TOKEN was set but is invalid.",
    ],
    fixes: [
      "Run `helpbase login` to authenticate.",
      "For CI: set HELPBASE_TOKEN to a fresh token.",
    ],
  },
  "e-auth-send-otp": {
    code: "E_AUTH_SEND_OTP",
    title: "Couldn't send the login code",
    summary: "helpbase login couldn't deliver the one-time code.",
    causes: [
      "Typo in the email address.",
      "Rate-limited (you requested too many codes recently).",
      "Transient issue with the auth provider.",
    ],
    fixes: [
      "Double-check your email for typos.",
      "Wait a minute, then run `helpbase login` again.",
    ],
  },
  "e-auth-verify-otp": {
    code: "E_AUTH_VERIFY_OTP",
    title: "The login code didn't verify",
    summary: "The 6-digit code you entered was wrong or expired.",
    causes: [
      "You typed the code incorrectly.",
      "The code expired (they're valid for a few minutes).",
      "You used a code from an older email; only the most recent one works.",
    ],
    fixes: [
      "Run `helpbase login` to request a fresh code.",
      "Check your spam folder for the latest email.",
    ],
  },
  "e-auth-token-invalid": {
    code: "E_AUTH_TOKEN_INVALID",
    title: "HELPBASE_TOKEN is invalid or expired",
    summary: "You set HELPBASE_TOKEN but the server rejected it.",
    causes: [
      "The token expired.",
      "You copied a truncated or malformed token.",
      "The account was disabled.",
    ],
    fixes: [
      "Re-issue the token and update your CI secret.",
      "Run `helpbase whoami` locally to verify a token works.",
    ],
  },
  "e-slug-taken": {
    code: "E_SLUG_TAKEN",
    title: "Subdomain is already taken",
    summary: "Someone else already deployed to the subdomain you requested.",
    causes: ["The slug you chose is in use by another helpbase tenant."],
    fixes: [
      "Pick a different slug and pass it with `--slug <name>`.",
      "If you own the existing tenant, use `helpbase link --slug <name>` instead.",
    ],
  },
  "e-slug-reserved": {
    code: "E_SLUG_RESERVED",
    title: "Subdomain is reserved",
    summary: "That slug is reserved for infrastructure use.",
    causes: [
      "You tried to use a reserved name (www, api, admin, dashboard, docs, etc.).",
    ],
    fixes: ["Choose a different subdomain."],
  },
  "e-tenant-not-found": {
    code: "E_TENANT_NOT_FOUND",
    title: "Linked tenant not found",
    summary:
      ".helpbase/project.json points at a tenant that no longer exists or you don't have access to.",
    causes: [
      "The tenant was deleted.",
      "You're logged in as a different account than the one that created the tenant.",
      "The project.json file is stale from a test deploy.",
    ],
    fixes: [
      "Run `helpbase link --remove` then `helpbase link` to relink.",
      "Run `helpbase whoami` to check which account is active.",
    ],
  },
  "e-missing-api-key": {
    code: "E_MISSING_API_KEY",
    title: "AI_GATEWAY_API_KEY not set",
    summary:
      "helpbase generate needs an AI gateway key to call the model provider.",
    causes: ["AI_GATEWAY_API_KEY isn't in your environment."],
    fixes: [
      "Get a key at https://vercel.com/ai-gateway.",
      "Export it: `export AI_GATEWAY_API_KEY=<your-key>`.",
    ],
  },
  "e-not-a-project": {
    code: "E_NOT_A_PROJECT",
    title: "Not a helpbase project",
    summary:
      "You ran `helpbase dev` somewhere without a Next.js package.json.",
    causes: [
      "You're in the wrong directory.",
      "The project was never scaffolded.",
      "Dependencies were never installed.",
    ],
    fixes: [
      "cd into your helpbase project root.",
      "Run `npx create-helpbase my-help-center` to start a fresh one.",
    ],
  },
}

export function generateStaticParams() {
  return Object.keys(ERRORS).map((code) => ({ code }))
}

export default async function ErrorPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const doc = ERRORS[code]
  if (!doc) notFound()

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-8 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          ← helpbase
        </Link>
      </nav>

      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-mono text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
        <span className="inline-block size-1.5 rounded-full bg-red-500" />
        {doc.code}
      </div>

      <h1 className="mb-3 text-3xl font-semibold tracking-tight">{doc.title}</h1>
      <p className="mb-10 text-lg text-muted-foreground">{doc.summary}</p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Common causes
        </h2>
        <ul className="space-y-2">
          {doc.causes.map((c, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          How to fix
        </h2>
        <ul className="space-y-2">
          {doc.fixes.map((f, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-emerald-500/60" />
              <span
                className="[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm"
                dangerouslySetInnerHTML={{
                  __html: f.replace(/`([^`]+)`/g, "<code>$1</code>"),
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      {doc.seeAlso && doc.seeAlso.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            See also
          </h2>
          <ul className="space-y-1">
            {doc.seeAlso.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-primary hover:underline">
                  {link.label} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-16 border-t pt-6 text-sm text-muted-foreground">
        Found a problem with this page?{" "}
        <Link
          href="https://github.com/Codehagen/helpbase/issues/new"
          className="text-primary hover:underline"
        >
          Open an issue
        </Link>
        .
      </footer>
    </main>
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const doc = ERRORS[code]
  if (!doc) return {}
  return {
    title: `${doc.code}: ${doc.title} — helpbase`,
    description: doc.summary,
  }
}
