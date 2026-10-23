import { defineConfig } from "@playwright/test";

// E9g A5 (D-376): the Electron e2e of the desktop app (Playwright's Electron support, no browser download).
// Runs against the built, unpackaged app (`pnpm run build` first) with the fake harness (e2e/fake-harness.mjs).
// Linux CI: under xvfb-run. Run: pnpm --dir apps/desktop e2e
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
});
