import { defineConfig } from "vitest/config";
import { workspaceAliases, EXCLUDE } from "./vitest.shared.js";

// D-067 / D-132: one project per package, run serially (run.lock).
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
    passWithNoTests: true,
    projects: [
      project("sandbox", "packages/sandbox"),
      project("egress-gate", "packages/egress-gate"),
      project("worker", "apps/worker"),
      project("bench", "bench"),
    ],
  },
});

export default config;
