import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { workspaceAliases, EXCLUDE } from "./vitest.shared.js";

// D-067 / D-132: one project per package, run serially (run.lock). D-260: the sandbox Docker test lives in
// apps/worker (it needs the harness gate), so packages/sandbox (core) imports only core.
const project = (name: string, dir: string) => ({
  extends: true as const,
  test: { name, include: [`${dir}/**/*.docker.test.ts`], exclude: EXCLUDE },
});

// D-389: the tests bind-mount folders they make with os.tmpdir(); macOS's /var/folders is not shared with Colima's VM
// (only the home folder is), so the gate saw empty folders. Their temporary folder lives in the repo instead.
const tmp = process.env.MANDAT_DOCKER_TMP ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".mandat", "tmp-docker");
mkdirSync(tmp, { recursive: true });

export const config = defineConfig({
  resolve: { alias: workspaceAliases() },
  test: {
    fileParallelism: false,
    env: { TMPDIR: tmp },
    testTimeout: 600_000,
    hookTimeout: 600_000,
    passWithNoTests: false,
    reporters: ["default", "json"],
    includeTaskLocation: true,
    outputFile: { json: "test-results/docker.json" },
    projects: [
      project("egress-gate", "packages/egress-gate"),
      project("gate", "packages/gate-github"),
      project("mcp", "packages/mcp"),
      project("verify", "packages/verify"),
      project("worker", "apps/worker"),
      project("web", "apps/web"),
      project("bench", "bench"),
    ],
  },
});

export default config;
