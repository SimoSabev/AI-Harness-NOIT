import { defineConfig } from "@playwright/test";

// Демо промпт т. 8.1: e2e + axe against `next start` on a disposable database (e2e/global-setup.ts), dev login.
const PORT = 3100;
export const E2E_DB = process.env.MANDAT_E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/mandat_e2e";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath: process.env.MANDAT_CHROMIUM ?? "/opt/pw-browsers/chromium" },
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { MANDAT_DB_URL: E2E_DB, MANDAT_DEMO_DEV_AUTH: "1", MANDAT_DEMO_AGENTS: "1", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
