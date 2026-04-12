#!/usr/bin/env node
// Cold-start benchmark. Runs `helpbase --version` and `helpbase --help`
// N times, reports p50/p95, enforces a budget against recorded baseline.
//
// Baseline is stored in scripts/bench-baseline.json. Update it intentionally
// only when a regression is genuinely worth the cost.

import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const cliEntry = resolve(here, "..", "dist", "index.js")
const baselineFile = join(here, "bench-baseline.json")

const BUDGET_MS = 50 // allowed regression over baseline
const ITERATIONS = 10

interface Baseline {
  version_p50: number
  version_p95: number
  help_p50: number
  help_p95: number
  capturedAt: string
}

function runOnce(args: string[]): number {
  const start = process.hrtime.bigint()
  const res = spawnSync(process.execPath, [cliEntry, ...args], {
    stdio: "ignore",
  })
  const end = process.hrtime.bigint()
  if (res.status !== 0) throw new Error(`CLI exited ${res.status} for args ${args.join(" ")}`)
  return Number(end - start) / 1e6 // ms
}

function bench(args: string[]): { p50: number; p95: number; samples: number[] } {
  // Warm run (module cache, disk cache) discarded.
  runOnce(args)
  const samples: number[] = []
  for (let i = 0; i < ITERATIONS; i++) samples.push(runOnce(args))
  samples.sort((a, b) => a - b)
  return {
    p50: samples[Math.floor(samples.length / 2)]!,
    p95: samples[Math.floor(samples.length * 0.95)]!,
    samples,
  }
}

function main() {
  if (!existsSync(cliEntry)) {
    console.error("dist/index.js missing. Run `pnpm build` first.")
    process.exit(2)
  }

  const ver = bench(["--version"])
  const help = bench(["--help"])

  const line = (label: string, { p50, p95 }: { p50: number; p95: number }) =>
    `  ${label.padEnd(14)} p50=${p50.toFixed(0).padStart(4)}ms  p95=${p95.toFixed(0).padStart(4)}ms`

  console.log("cold-start bench")
  console.log(line("--version", ver))
  console.log(line("--help", help))

  const mode = process.argv[2]
  if (mode === "--capture") {
    const baseline: Baseline = {
      version_p50: Math.round(ver.p50),
      version_p95: Math.round(ver.p95),
      help_p50: Math.round(help.p50),
      help_p95: Math.round(help.p95),
      capturedAt: new Date().toISOString(),
    }
    writeFileSync(baselineFile, JSON.stringify(baseline, null, 2) + "\n")
    console.log(`\nbaseline captured → ${baselineFile}`)
    return
  }

  if (!existsSync(baselineFile)) {
    console.log("\nno baseline yet — run with --capture to record one")
    return
  }

  const baseline: Baseline = JSON.parse(readFileSync(baselineFile, "utf-8"))
  console.log(`\nbaseline (from ${baseline.capturedAt.split("T")[0]}):`)
  console.log(line("--version", { p50: baseline.version_p50, p95: baseline.version_p95 }))
  console.log(line("--help", { p50: baseline.help_p50, p95: baseline.help_p95 }))

  const deltas = [
    { name: "--version p50", delta: ver.p50 - baseline.version_p50 },
    { name: "--help p50", delta: help.p50 - baseline.help_p50 },
  ]

  console.log("\ndeltas:")
  let failed = false
  for (const { name, delta } of deltas) {
    const sign = delta >= 0 ? "+" : ""
    const budget = delta > BUDGET_MS
    const marker = budget ? "✖ OVER BUDGET" : "ok"
    if (budget) failed = true
    console.log(`  ${name.padEnd(20)} ${sign}${delta.toFixed(0)}ms  (budget ${BUDGET_MS}ms) ${marker}`)
  }

  if (failed) {
    console.error(`\nCold-start regression exceeds ${BUDGET_MS}ms budget.`)
    process.exit(1)
  }
  console.log("\nwithin budget")
}

main()
