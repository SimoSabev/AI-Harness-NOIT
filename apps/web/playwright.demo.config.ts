import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Демо промпт т. 9.7: the three scenes in offline mode with video (demo/recordings/*.webm, .gitignore) and key-frame
// screenshots (demo/screenshots/). Same disposable database and dev login as the e2e suite, plus the scene state.
export default defineConfig({
  ...base,
  testDir: "demo-e2e",
  globalSetup: "./demo-e2e/global-setup.ts",
  outputDir: "../../demo/recordings/playwright",
  use: { ...base.use, video: { mode: "on", size: { width: 1280, height: 800 } }, viewport: { width: 1280, height: 800 } },
});
