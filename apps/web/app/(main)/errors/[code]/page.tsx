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
  "e-no-mcp-token": {
    code: "E_NO_MCP_TOKEN",
    title: "HELPBASE_MCP_TOKEN not set",
    summary:
      "The HTTP MCP transport refuses to run without a bearer token. An unauthenticated MCP endpoint on the open web is a footgun we don't ship.",
    causes: [
      "You ran `helpbase mcp start --http` without exporting `HELPBASE_MCP_TOKEN`.",
      "The env var is set in your shell but not in the process you're launching from (e.g. inside a CI job or docker container).",
    ],
    fixes: [
      "Generate a strong token: `export HELPBASE_MCP_TOKEN=\"$(openssl rand -hex 32)\"`.",
      "In GitHub Actions: add it as a repo secret and pass it via `env:` on the job.",
      "In Docker: pass it via `-e HELPBASE_MCP_TOKEN=...` on `docker run`.",
      "For stdio mode (Claude Desktop / Cursor / Zed), no token is needed — drop the `--http` flag.",
    ],
  },
  "e-no-gh": {
    code: "E_NO_GH",
    title: "GitHub CLI (`gh`) not found",
    summary:
      "`helpbase sync --pr` needs `gh` to open a pull request, and it isn't on your PATH.",
    causes: [
      "GitHub CLI isn't installed on this machine.",
      "`gh` is installed but not on the PATH of this shell.",
      "You're in a CI environment that doesn't preinstall `gh`.",
    ],
    fixes: [
      "Install: https://cli.github.com/ (brew install gh / winget / apt).",
      "In GitHub Actions, `gh` is preinstalled — make sure the workflow runs on `ubuntu-latest`.",
      "Drop the `--pr` flag and open the PR manually from the written diff.",
    ],
  },
  "e-no-citations": {
    code: "E_NO_CITATIONS",
    title: "Every proposal failed the citation gate",
    summary:
      "The model returned proposals, but none of them included valid citations into your source code. helpbase rejected them all.",
    causes: [
      "The prompt or model regressed and is emitting ungrounded suggestions.",
      "The diff was too small for the model to ground an edit to it.",
      "The docs don't match anything in the diff — unlikely but possible.",
    ],
    fixes: [
      "Re-run the command — transient model behavior sometimes clears up.",
      "Try `--test` to use the cheap gateway model and compare output.",
      "If it keeps happening on a reproducible diff, open an issue with the diff attached.",
    ],
  },
  "e-no-history": {
    code: "E_NO_HISTORY",
    title: "No code changes to sync against",
    summary:
      "helpbase sync asked git for a diff, and git returned nothing.",
    causes: [
      "The `--since` rev is identical to HEAD (no commits in between).",
      "You just cloned the repo and haven't made changes yet.",
      "The branch you're on hasn't diverged from the base branch.",
    ],
    fixes: [
      "Make some code changes, commit them, and re-run.",
      "Pass a deeper rev: `helpbase sync --since HEAD~20`.",
      "Pass an explicit base: `helpbase sync --since origin/main`.",
    ],
  },
  "e-invalid-rev": {
    code: "E_INVALID_REV",
    title: "Git couldn't resolve that revision",
    summary:
      "The `--since` value you passed doesn't refer to a real commit, branch, or tag.",
    causes: [
      "Typo in the rev (e.g. `HEAD-5` instead of `HEAD~5`).",
      "The branch hasn't been fetched yet (e.g. `origin/main` where remote isn't set).",
      "The ref was deleted.",
    ],
    fixes: [
      "Check `git log --oneline -20` and pass a rev that exists.",
      "Fetch first: `git fetch origin && helpbase sync --since origin/main`.",
      "Use a relative rev: `helpbase sync --since HEAD~5`.",
    ],
  },
  "e-no-content": {
    code: "E_NO_CONTENT",
    title: "No MDX content found",
    summary:
      "helpbase sync looked for MDX files in the content directory and came up empty.",
    causes: [
      "You're running it from the wrong directory.",
      "This project scaffolded without any docs yet.",
      "Docs live somewhere other than `content/`.",
    ],
    fixes: [
      "cd into your helpbase project root.",
      "Pass the right directory: `helpbase sync --content docs/`.",
      "Add a doc first: `helpbase new` or `helpbase generate --url <site>`.",
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
  "e-auth-required": {
    code: "E_AUTH_REQUIRED",
    title: "Not signed in to helpbase",
    summary:
      "A command that needs authentication (generate, sync, context) ran without a helpbase session and without a BYOK key.",
    causes: [
      "You haven't run `helpbase login` on this machine yet.",
      "Your session expired and could not be refreshed.",
      "In CI, `HELPBASE_TOKEN` is either not set or no longer valid.",
    ],
    fixes: [
      "Run `helpbase login` — free tier, no card, 500k tokens/day.",
      "For CI: set `HELPBASE_TOKEN` to a valid session token.",
      "Or bring your own key: `export AI_GATEWAY_API_KEY=…` (see /docs/byok).",
    ],
    seeAlso: [{ label: "BYOK docs", href: "/docs/byok" }],
  },
  "e-quota-exceeded": {
    code: "E_QUOTA_EXCEEDED",
    title: "Daily free-tier quota reached",
    summary:
      "You've used today's free allocation of tokens across helpbase LLM calls. The limit resets at UTC midnight.",
    causes: [
      "You hit 500,000 tokens of generate / sync / context --ask calls today.",
      "A single call would take you over the remaining budget.",
    ],
    fixes: [
      "Wait for the UTC-midnight reset.",
      "Join the paid-tier waitlist: https://helpbase.dev/waitlist",
      "Bring your own Vercel AI Gateway key: `export AI_GATEWAY_API_KEY=…` (unlimited, your own bill).",
    ],
    seeAlso: [
      { label: "Waitlist", href: "/waitlist" },
      { label: "BYOK docs", href: "/docs/byok" },
    ],
  },
  "e-global-cap": {
    code: "E_GLOBAL_CAP",
    title: "helpbase is over its daily cap",
    summary:
      "helpbase enforces a global 10M-token-per-day circuit breaker to protect against runaway spend. That cap was hit.",
    causes: [
      "A load spike (genuine or otherwise) exhausted the global daily allocation.",
      "Resets at UTC midnight like the per-user cap.",
    ],
    fixes: [
      "Wait for the UTC-midnight reset.",
      "Bring your own Vercel AI Gateway key to bypass the hosted proxy entirely: `export AI_GATEWAY_API_KEY=…`",
    ],
    seeAlso: [{ label: "BYOK docs", href: "/docs/byok" }],
  },
  "e-llm-network": {
    code: "E_LLM_NETWORK",
    title: "Couldn't reach helpbase.dev",
    summary:
      "The CLI tried to call the hosted LLM proxy but the request never landed — likely a network problem between you and helpbase.dev.",
    causes: [
      "Internet connection is down or flaky.",
      "A corporate proxy or firewall is blocking helpbase.dev.",
      "DNS resolution is failing.",
    ],
    fixes: [
      "Check your connection and retry — transient blips are common.",
      "If you're behind a corporate proxy, verify helpbase.dev is reachable.",
      "Fall back to BYOK so calls don't go through helpbase.dev: `export AI_GATEWAY_API_KEY=…`",
    ],
    seeAlso: [{ label: "BYOK docs", href: "/docs/byok" }],
  },
  "e-llm-gateway": {
    code: "E_LLM_GATEWAY",
    title: "LLM provider returned an error",
    summary:
      "The underlying model provider (e.g. Anthropic, Google) returned a non-success response. No tokens were charged against your quota.",
    causes: [
      "The model ID is wrong or unsupported by Vercel AI Gateway.",
      "Upstream provider is degraded.",
      "The prompt triggered a provider-side safety filter.",
    ],
    fixes: [
      "Retry in a moment — transient upstream errors are common.",
      "Try a different `--model` (e.g. `anthropic/claude-sonnet-4.6`).",
      "Check status.anthropic.com / openai.com if the problem persists.",
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
