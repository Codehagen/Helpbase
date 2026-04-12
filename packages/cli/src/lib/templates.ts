export interface Template {
  id: string
  label: string
  description: string
  defaultCategory: string
  defaultTitle: string
  defaultTags: string[]
  body: string
}

export const TEMPLATES: Record<string, Template> = {
  "getting-started": {
    id: "getting-started",
    label: "Getting Started",
    description: "Welcome article walking a new user through their first task",
    defaultCategory: "getting-started",
    defaultTitle: "Get started with [product]",
    defaultTags: ["getting-started"],
    body: `## Overview

Welcome! This guide walks you through the basics so you can get up and running in under ten minutes. By the end you will have completed your first task and know where to go next.

## What you need

Before you begin, make sure you have:

- An account (sign up at the homepage if you do not have one yet)
- The latest version of the app installed
- A few minutes of uninterrupted time

## First steps

<Steps>
  <Step title="Install">
    Grab the latest version and verify the install worked:
    \`\`\`bash
    npm install -g your-product
    your-product --version
    \`\`\`
  </Step>
  <Step title="Create your workspace">
    Open the app and click **New workspace**. Give it a name that reflects what you are working on. You can rename it later.
  </Step>
  <Step title="Invite your team (optional)">
    If you are collaborating, add teammates by email now. They will receive an invite and can join right away. You can skip this and invite people later.
  </Step>
  <Step title="Complete your first task">
    Follow the in-app prompts to finish the starter task. This takes about two minutes and introduces the core features you will use every day.
  </Step>
</Steps>

<Callout type="tip">Keep the dashboard open in a tab while you are learning. Most answers are one click away.</Callout>

## Next steps

<CardGroup cols={2}>
  <Card icon="book-open" title="Why it works this way" href="/concepts/overview">The mental model behind the product, in 5 minutes.</Card>
  <Card icon="zap" title="Do something specific" href="/how-to-guides">Task-focused how-to guides for the everyday stuff.</Card>
  <Card icon="settings" title="Make it yours" href="/getting-started/configuration">Tune the defaults to match how your team works.</Card>
  <Card icon="life-buoy" title="Something not working?" href="/troubleshooting">Common issues with quick fixes.</Card>
</CardGroup>
`,
  },
  "how-to": {
    id: "how-to",
    label: "How-to guide",
    description: "Task-oriented guide for accomplishing a specific goal",
    defaultCategory: "how-to-guides",
    defaultTitle: "How to do [task]",
    defaultTags: ["how-to"],
    body: `## Overview

This guide shows you how to accomplish a specific task. Use it when you already know what you want to do and just need the exact steps.

## Prerequisites

- An active account with the relevant permission
- The feature enabled for your workspace (check under **Settings → Features**)
- About five minutes

If you are not sure whether you have access, ask your workspace admin before starting.

## Steps

<Steps>
  <Step title="Open the relevant screen">
    Navigate to the section of the app where this task lives. The quickest path is from the main dashboard, look for the matching icon in the sidebar. For example, to reset a password, go to **Settings → Security**.
  </Step>
  <Step title="Start the action">
    Click the primary action button. A modal or side panel will open with the fields you need. If you prefer the CLI:
    \`\`\`bash
    your-product do-thing --name "example"
    \`\`\`
  </Step>
  <Step title="Fill in the details">
    Enter the required information. Fields marked with an asterisk are required; the rest are optional and can be edited later.
  </Step>
  <Step title="Confirm and save">
    Review your entries and click **Save**. You will see a confirmation and be returned to the previous screen.
  </Step>
</Steps>

## Verify it worked

After saving, confirm the change took effect:

- The new item appears in the relevant list
- Any teammates you shared it with receive a notification within a minute
- The activity log shows the action with your name and timestamp

## Troubleshooting

<Callout type="warning">**Save button disabled?** The most common cause is a required field left blank. Scroll up and look for a red outline around any field. If all fields are filled and the button is still disabled, refresh the page and try again, a stale session can sometimes block the submit.</Callout>

## Related articles

<CardGroup cols={2}>
  <Card icon="list-checks" title="More how-to guides" href="/how-to-guides">Other step-by-step guides for common tasks.</Card>
  <Card icon="book-open" title="The concept behind this" href="/concepts/overview">Understand the mental model so you can adapt these steps.</Card>
  <Card icon="file-code" title="API / CLI reference" href="/reference">Exact flags, fields, and return shapes.</Card>
  <Card icon="life-buoy" title="Stuck?" href="/troubleshooting">Common failure modes and their fixes.</Card>
</CardGroup>
`,
  },
  concept: {
    id: "concept",
    label: "Concept",
    description: "Explainer for a core idea, feature, or mental model",
    defaultCategory: "concepts",
    defaultTitle: "[Concept name]",
    defaultTags: ["concepts"],
    body: `## TL;DR

In one or two sentences: explain what this concept is and why a user should care. The rest of the article fills in the detail, but a reader who only scans the top should walk away with the core idea.

## Background

This concept exists because users kept running into a specific problem. Before it, the workaround was tedious and error-prone. Understanding the concept helps you use the product the way it was designed to be used, not against the grain.

## How it works

Here is the mental model:

\`\`\`
  INPUT ──▶ PROCESS ──▶ OUTPUT
    │         │           │
    ▼         ▼           ▼
  What      What        What the
  the user  the system  user sees
  provides  does        after
\`\`\`

The system takes what you give it, transforms it through a predictable set of rules, and produces a result you can rely on. The rules are deterministic, the same input always produces the same output, which makes debugging and reasoning about behavior straightforward.

In code, the flow looks like this:

\`\`\`ts
const result = pipeline(input)
//    ^^^^^^ always the same shape for the same input
\`\`\`

Three properties are worth remembering:

1. **Deterministic.** Same input, same output. No hidden state.
2. **Composable.** The output of one step can be the input of another.
3. **Inspectable.** At every step, you can see what happened and why.

<Callout type="tip">**When to use it:** Reach for this concept when you need a reliable, repeatable result and you want to be able to explain the outcome to a teammate without hand-waving.</Callout>

## When NOT to use it

This concept is not a fit when:

- You need probabilistic or fuzzy behavior (a different feature covers that case)
- The data you are working with changes mid-flight in ways you cannot predict
- You need one-off exploratory output rather than a repeatable pipeline

In those cases, the overhead of setting up a deterministic flow outweighs the benefit.

## Related

<CardGroup cols={2}>
  <Card icon="compass" title="Other core concepts" href="/concepts/overview">Related mental models that compose with this one.</Card>
  <Card icon="zap" title="Apply it: how-to guides" href="/how-to-guides">Step-by-step tasks that put this concept to work.</Card>
  <Card icon="file-code" title="API / CLI reference" href="/reference">See the exact surface area this concept describes.</Card>
</CardGroup>
`,
  },
  troubleshooting: {
    id: "troubleshooting",
    label: "Troubleshooting",
    description: "Diagnose a problem and walk the user to a fix",
    defaultCategory: "troubleshooting",
    defaultTitle: "Fix [problem]",
    defaultTags: ["troubleshooting"],
    body: `## Overview

Describe the problem your users are experiencing and what they should expect after following these steps.

## Diagnosis

<Callout type="warning">Before proceeding, make sure you have saved any unsaved work.</Callout>

Check for the most common causes first:

1. Verify your configuration is correct
2. Check the error logs for specific messages
3. Confirm your environment meets the requirements

A quick sanity check from the command line:

\`\`\`bash
your-product doctor
\`\`\`

## Solution

<Steps>
  <Step title="Identify the error">
    Look for the specific error message in your logs or console output. Note down the exact wording, this helps narrow the root cause. For example:
    \`\`\`
    Error: configuration file not found at ./your-product.config.js
    \`\`\`
  </Step>
  <Step title="Apply the fix">
    Based on the error message, apply the appropriate fix from the table below. If your error is not listed, check the related articles at the bottom of this page.
  </Step>
  <Step title="Verify the fix">
    After applying the fix, restart your application and confirm the issue is resolved. If the problem persists, try the alternative approaches below.
  </Step>
</Steps>

## Alternative approaches

<Callout type="tip">If the main solution did not work, these alternatives may help with edge cases.</Callout>

Describe any fallback approaches or workarounds here.

## Related articles

<CardGroup cols={2}>
  <Card icon="life-buoy" title="More troubleshooting" href="/troubleshooting">Other common failure modes and their fixes.</Card>
  <Card icon="list-checks" title="The setup how-to" href="/how-to-guides">Walk through the correct setup from scratch.</Card>
  <Card icon="activity" title="Run helpbase doctor" href="/reference/doctor">Let the CLI auto-diagnose common misconfigurations.</Card>
  <Card icon="message-circle" title="Still stuck? Get help" href="/community">Open an issue or ask in the community channel.</Card>
</CardGroup>
`,
  },
}

export const VALID_TYPES = Object.keys(TEMPLATES)

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
