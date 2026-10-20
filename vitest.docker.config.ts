import { defineConfig } from "vitest/config";
import { workspaceAliases, EXCLUDE } from "./vitest.shared.js";

// D-067 / D-132: one project per package, run serially (run.lock). D-260: the sandbox Docker test lives in
// apps/worker (it needs the harness gate), so packages/sandbox (core) imports only core.
const project = (name: string, dir: string) => ({
  extends: true as const,
  test: { name, include: [`${dir}/**/*.docker.test.ts`], exclude: EXCLUDE },
});

export const config = defineConfig({
  resolve: { alias: workspaceAliases() },
  test: {
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
    passWithNoTests: false,
    reporters: ["default", "json"],
    includeTaskLocation: true,
    outputFile: { json: "test-results/docker.json" },
    projects: [
      project("egress-gate", "packages/egress-gate"),
      project("verify", "packages/verify"),
      project("worker", "apps/worker"),
      project("bench", "bench"),
    ],
  },
});

export default config;
