import { defineConfig } from "vitest/config";
import { workspaceAliases, EXCLUDE } from "./vitest.shared.js";

// D-228: live tests (*.live.test.ts); without their env they are SKIPPED (never passed). Run by Simo.
export const config = defineConfig({
  resolve: { alias: workspaceAliases() },
  test: {
    include: ["packages/*/src/**/*.live.test.ts", "apps/*/src/**/*.live.test.ts"],
    exclude: EXCLUDE,
    testTimeout: 120_000,
    passWithNoTests: false,
    reporters: ["default", "json"],
    includeTaskLocation: true,
    outputFile: { json: "test-results/live.json" },
    projects: [{ extends: true, test: { name: "live" } }],
  },
});

export default config;
