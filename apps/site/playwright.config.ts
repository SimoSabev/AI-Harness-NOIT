import { defineConfig } from "@playwright/test";

// E9g B step 7 (D-378): axe on every page of the static export (apps/site/out), served the way a static host does.
// Run: pnpm --filter @mandat/site build && pnpm --filter @mandat/site e2e  (MANDAT_CHROMIUM = a local Chromium, optional)
const PORT = 3101;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...(process.env.MANDAT_CHROMIUM ? { launchOptions: { executablePath: process.env.MANDAT_CHROMIUM } } : {}),
  },
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
