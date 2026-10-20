import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildShopFixture } from "@mandat/worker";

// T3-3 / D-223: `mandat bench --fail-gate` → exit 1 and the fault line.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-failgate-"));
buildShopFixture({ repoRoot, mandatHome: home, force: false });

describe("bench --fail-gate (docker)", () => {
  it("счупеният проверяващ се хваща: не VERIFIED, exit 1", () => {
    const r = spawnSync("node", [path.join(repoRoot, "packages/cli/dist/main.js"), "--home", home, "bench", "--fail-gate"], { cwd: repoRoot, encoding: "utf8", env: process.env, timeout: 900_000 });
    expect(r.stdout).toContain("fail-gate: verifier fault detected (D1:report_invalid:missing)");
    expect(r.status).toBe(1);
  });
});
