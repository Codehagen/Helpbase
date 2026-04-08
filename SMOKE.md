# Smoke-testing helpbase's AI article generation

## Why this exists

The article generator in `packages/shared/src/ai.ts` turns a scraped webpage
into help articles via the Vercel AI Gateway. Every unit test in the repo
mocks the `ai` module, which means **no test in `pnpm test` can tell you if
Gemini Flash Lite still produces good articles.** The only way to know is to
run it against a real site with a real API key and read the output.

`pnpm smoke` is that check. Run it when you:

- Change anything in `buildPrompt` or `generateArticlesFromContent`
- Bump `DEFAULT_MODEL` or `TEST_MODEL`
- Touch `scrapeUrl`, `articleToMdx`, or `planArticleWrites`
- Open a PR that changes how articles are generated end to end

**Target: under 15 minutes for a first-time run (including Gateway signup),
under 5 minutes once your key is exported.**

## What it costs

Each full `pnpm smoke` run costs **~$0.02-0.05** on Gemini 3.1 Flash Lite.
It hits two URLs (`vercel.com`, `resend.com`) and generates 6-12 articles.

A baseline run (`pnpm smoke --baseline`) runs twice, so roughly **$0.04-0.10**.

Vercel AI Gateway gives new accounts **$5 in free credit** (no credit card
required), which is enough for 50-100 full runs. Your coffee is more
expensive than this whole contribution workflow.

## Setup (one time, ~3 minutes)

1. Go to [vercel.com/ai-gateway](https://vercel.com/ai-gateway) and sign up.
2. Create an API key and copy it.
3. Export it in your shell:
   ```bash
   export AI_GATEWAY_API_KEY=your_key_here
   ```
   If you plan to iterate on prompts often, add this line to your
   `~/.zshrc` or `~/.bashrc` so it survives terminal restarts.

## Run it

From the repo root:

```bash
# Simple mode: just run the working-tree prompt against both targets
pnpm smoke

# Baseline mode: compare committed prompt vs your change side by side
pnpm smoke --baseline
```

Takes ~90 seconds for simple mode, ~3 minutes for baseline mode. Output lands
in `/tmp/helpbase-smoke-<timestamp>/`.

## The grading rubric

Every generated article should pass all 7 criteria. Borderline nits are
acceptable (≤1 per article). Multiple clear fails on any one criterion means
the prompt needs work.

### 1. Title is action-oriented

A verb-led, instructional title that tells the reader what they will
accomplish.

**PASS:**
- `"How to reset your password"`
- `"Deploy a Next.js app to Vercel"`
- `"Send your first transactional email"`
- `"Connect a custom domain"`

**FAIL:**
- `"Password Reset Overview"` — noun phrase, not an instruction
- `"Deployment"` — single word, no action
- `"About email sending"` — meta, not instructional
- `"Getting Started Guide"` — filler, not action

### 2. Description is one plain sentence, no marketing copy

A single declarative sentence that summarizes what the article covers.
No adjectives, no superlatives, no hype.

**PASS:**
- `"Steps to recover account access via email."`
- `"Configure DNS records to send from your own domain."`
- `"Set up billing and add your first payment method."`

**FAIL:**
- `"Unlock the full power of seamless account recovery with our industry-leading..."` — marketing copy
- `"The ultimate guide to deployment."` — hype
- `"Email sending."` — sentence fragment, not descriptive
- `"Welcome! This guide will walk you through..."` — greeting, not a description

### 3. Category is human-readable

Category names should be something a product manager would write on a
whiteboard, not a slug or a guess.

**PASS:**
- `"Getting Started"`
- `"Account & Billing"`
- `"Features"`
- `"Troubleshooting"`
- `"API Reference"`

**FAIL:**
- `"intro-stuff"` — slug, not a title
- `"misc"` — content-free
- `"other"` — content-free
- `"general"` — content-free
- `"Stuff for new users kind of"` — rambling

### 4. Body has at least 3 concrete steps or sections

The body should be structured content (headings, lists, steps), not a
single paragraph of vibes.

**PASS:**
- A body with `## Before you start`, `## Steps`, `## Next steps`
- A numbered list of 4+ concrete actions
- Multiple `###` subsections, each with actionable content

**FAIL:**
- One paragraph of prose with no structure
- A body shorter than ~100 words
- Sections that are all "coming soon" or "documentation TBD"

### 5. No hallucinated features

Every claim in the body must trace back to something on the source URL.
No invented features, fake pricing, or made-up UI elements.

**How to check:** Open the source URL in a browser. `cmd+F` for key nouns
from the article body (product names, feature names, UI labels). If a name
is in the article but not on the page, the LLM hallucinated it.

### 6. Tags are lowercase, 2-4 items

**PASS:** `["billing", "subscription", "payment"]`

**FAIL:**
- `["Billing", "Subscription"]` — not lowercase
- `[]` — missing
- `["account", "billing", "subscription", "payment", "credit-card", "invoice"]` — too many
- `["account"]` — too few

### 7. Frontmatter is valid YAML

This one is automated — the CLI round-trips every file through
`gray-matter` before exiting. If a generated file has broken frontmatter,
the smoke test will fail loudly with the exact file path. File a bug.

## How to tell if your prompt change is *better*

This is the whole reason `pnpm smoke --baseline` exists.

```bash
pnpm smoke --baseline
```

The script runs twice:

1. **baseline:** stashes your changes, builds the CLI from the committed
   `packages/shared/src/ai.ts`, runs both targets, output → `.../baseline/`
2. **current:** restores your changes, rebuilds, runs both targets,
   output → `.../current/`

Then open both folders in your editor and diff. VS Code users can
`cmd+shift+p` → "Compare Folders" after installing the extension, or just
open the two MDX files side by side.

Ask yourself, article by article:

- Are the `current` titles sharper and more action-oriented?
- Are the `current` descriptions shorter and less marketing-y?
- Did the `current` run pick better category names?
- Did the `current` run drop any hallucinations the baseline had?
- Are there categories or topics the `current` run handles that the
  baseline missed entirely?

**If the answer is "no, it's the same or worse," revert the prompt change.**
That's what this workflow is for. It's much better to find out now than
after you've merged a subtly worse prompt.

## Failure triage: when articles are bad

| Symptom | Likely cause | Where to fix |
|---------|-------------|--------------|
| Articles are empty or under ~100 words | Scraped content was too short (the new guard should catch this) | Try a different URL; inspect with `helpbase generate --url ... --debug` to see the scraped text |
| Titles are generic (`"Overview"`, `"Guide"`) | Prompt is too permissive about titles | Tighten `buildPrompt`: add explicit "start with a verb" rule |
| Content has marketing fluff | Prompt doesn't forbid it | Add explicit negative examples: "Do not use words like 'seamless', 'powerful', 'effortless'" |
| Categories are weird (`"misc"`, `"other"`) | Prompt's category guidance is weak | Add a few-shot list of good category names to the prompt |
| Articles hallucinate features not on the site | Prompt doesn't enforce grounding hard enough | Strengthen the "Do NOT invent features" rule; add an explicit "every claim must be verifiable from the scraped content" sentence |
| Frontmatter is broken | Bug in `articleToMdx` escaping | File a bug with the broken file attached |
| Gateway returns 429 | Rate limit | Wait 60 seconds and re-run |
| Gateway returns quota exhausted | You burned through your free credit | Top up at vercel.com/ai-gateway or wait for monthly reset |
| Scrape fails with "too short" | The target page is an SPA or auth wall | Pick a different URL, or inspect what was scraped with `--debug` |

### The `--debug` flag

When an article looks wrong, you want to see what the LLM actually saw.
Run:

```bash
helpbase generate --url https://example.com -o /tmp/debug --debug --test
```

This writes the cleaned scraped text to `/tmp/debug/_scrape.txt` alongside
the generated articles. Open it and check:

- Is the content actually about the product, or is it a login page?
- Does it include the terminology the LLM used in the generated articles?
- Is it too short or missing the main content?

### The `--dry-run` flag

If you want to see what a run *would* cost and what would be sent to the
LLM without spending any tokens:

```bash
helpbase generate --url https://example.com -o /tmp/dry --dry-run --test
```

Prints the model, URL, scraped char count, estimated token count, and exits.

## PR checklist

When you open a PR that touches `packages/shared/src/ai.ts` or any prompt:

- [ ] I ran `pnpm smoke --baseline` (or `pnpm smoke` if this isn't a prompt change)
- [ ] I diffed `baseline/` vs `current/` and pasted a summary in the PR description
- [ ] At least one `current/` article was better than its `baseline/` counterpart, or they were equal
- [ ] Total Gateway spend was under $0.10 (screenshot the dashboard if the number is important)
- [ ] I compile-checked at least one generated article by copying it into `apps/web/content/<category>/` and running `pnpm --filter web build`

The `.github/pull_request_template.md` file auto-populates this checklist
on every PR. You don't have to remember it.

## Reporting a bad baseline

If `pnpm smoke --baseline` shows the committed prompt producing bad
articles on a clean checkout (not your prompt, the *baseline*), that is a
regression worth reporting. Possible causes:

- The underlying model drifted (Gemini Flash Lite shipped a new version)
- The scraper is catching something new in the target site's HTML
- The prompt has rotted over time without anyone noticing

File an issue at
[github.com/Codehagen/helpbase/issues](https://github.com/Codehagen/helpbase/issues)
with:

1. The `pnpm smoke --baseline` output (at least the article titles and
   descriptions from the baseline folder)
2. The Gemini model ID the test used (check the CLI output; it prints the
   model when `--test` is set)
3. The date (so we can correlate with upstream model changes)

Attach the worst offender articles if you can.

## Running against different URLs

Right now the script hits `vercel.com` and `resend.com`. If you want to
try a different target, run the CLI directly:

```bash
node packages/cli/dist/index.js generate \
  --url https://anthropic.com \
  -o /tmp/my-smoke \
  --test
```

Or edit `scripts/smoke-test.sh` and add a new entry to the `TARGETS`
array. Good target characteristics:

- Public, no auth wall
- Meaningful amount of content (500+ chars after strip)
- Real product with features, not a blog
- HTML-based (heavy SPAs won't scrape well with the current simple scraper)
