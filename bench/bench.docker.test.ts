import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildShopFixture } from "@mandat/worker";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const main = path.join(repoRoot, "packages/cli/dist/main.js");
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-bd-"));
buildShopFixture({ repoRoot, mandatHome: home, force: false });
const cli = (...a: string[]) => spawnSync("node", [main, "--home", home, ...a], { encoding: "utf8", env: process.env, timeout: 1_800_000 });

describe("bench (docker)", () => {
  it("bench 40/40, 0 false VERIFIED", () => {
    const r = cli("bench", "--json");
    const j = JSON.parse(r.stdout.trim()) as { pass: number; false_verified: number; false_failed: number; rows: unknown[] };
    expect([r.status, j.pass, j.rows.length, j.false_verified, j.false_failed]).toEqual([0, 40, 40, 0, 0]);
  }, 1_800_000); // 40 scenarios take ~13 min
  it("redteam 10/10 (R5, R6, R8, R14, R15–R20)", () => {
    const r = cli("redteam", "--json");
    const j = JSON.parse(r.stdout.trim()) as { pass: number; total: number; rows: { ok: boolean }[] };
    expect([r.status, j.pass, j.total, j.rows.length]).toEqual([0, 10, 10, 14]);
  });
});
