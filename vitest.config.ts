import { defineConfig } from "vitest/config";
import { workspaceAliases, EXCLUDE } from "./vitest.shared.js";

const strict = { lines: 90, branches: 85 };
const loose = { lines: 70 };

export const config = defineConfig({
  resolve: { alias: workspaceAliases() },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "bench/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: [...EXCLUDE, "**/*.docker.test.ts", "**/*.live.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000, // PGlite + all migrations per suite (apps/web, apps/worker)
    passWithNoTests: false,
    reporters: ["default", "json"],
    includeTaskLocation: true,
    outputFile: { json: "test-results/unit.json" },
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.test-helper.ts", "**/testing.ts", "**/index.ts", "**/main.ts", "**/*-main.ts"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        "packages/contract/src/**": strict,
        "packages/ledger/src/**": strict,
        "packages/redaction/src/**": strict,
        "packages/core/src/**": strict,
        "packages/export/src/**": strict,
        "packages/gate-github/src/**": { lines: 90 },
        "packages/mcp/src/**": { lines: 90 },
        "packages/verify/src/**": { lines: 90 }, // демо промпт т. 5 „Готово, когато“
        "packages/cli/src/**": loose,
        "packages/sandbox/src/**": loose,
        "packages/egress-gate/src/**": loose,
        "packages/llm-proxy/src/**": loose,
        "packages/channels/src/**": loose,
        "packages/agents/src/**": loose,
        "apps/worker/src/**": loose,
      },
    },
  },
});

export default config;
