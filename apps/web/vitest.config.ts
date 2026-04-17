import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

// Vitest 4's default pipeline doesn't transform JSX in .tsx test files —
// @vitejs/plugin-react wires up the automatic JSX runtime so component
// tests like app/device/AuthorizeDeviceClient.test.tsx parse cleanly.
// Test environment defaults to node (fast); jsdom-dependent files set
// it per-file with a `/* @vitest-environment jsdom */` comment.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
