import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseVitestReport } from "@mandat/contract";
import { verifyLedger } from "@mandat/ledger";
import { buildShopFixture, runTestProcedure } from "./index.js";
import { cleanupRun, dockerEnv, repoRoot, tempRun } from "./testing.js";
import { cleanClone as clone } from "@mandat/export";

let env: Awaited<ReturnType<typeof dockerEnv>>;
const main = path.join(repoRoot, "packages/cli/dist/main.js");
const M = "tests/cart.spec.ts > cart > applies 10% over 50";
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-wd-"));

beforeAll(async () => {
  env = await dockerEnv();
  buildShopFixture({ repoRoot, mandatHome: home, force: false });
});

function cli(...args: string[]) {
  const r = spawnSync("node", [main, "--home", home, ...args], { encoding: "utf8", env: process.env, timeout: 600_000 });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("worker (docker)", () => {
  it("fixtures build детерминистичен (D-050)", () => {
    const other = mkdtempSync(path.join(os.tmpdir(), "mandat-fx-"));
    const a = spawnSync("node", [main, "--home", other, "fixtures", "build"], { encoding: "utf8" }).stdout;
    const b = cli("fixtures", "build").stdout;
    expect(a.replace(" (unchanged)", "")).toBe(b.replace(" (unchanged)", ""));
    expect(b).toMatch(/^base_commit [0-9a-f]{40} \(unchanged\)\n$/);
    expect(a.trim().split(" ")[1]).toBe((JSON.parse(readFileSync(path.join(repoRoot, "contracts/fix-discount.json"), "utf8")) as { base_commit: string }).base_commit);
    rmSync(other, { recursive: true, force: true });
  });

  it("base пада точно с 1 тест; ръчната фикстура = истинския отчет (D-098)", async () => {
    const run = tempRun();
    try {
      const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-base-"));
      const base = await clone({ mirrorPath: path.join(home, "mirrors", "shop.git"), baseSha: (JSON.parse(readFileSync(path.join(repoRoot, "contracts/fix-discount.json"), "utf8")) as { base_commit: string }).base_commit, tmpRoot: tmp, name: "base" });
      const r = await runTestProcedure({
        docker: env.docker, runId: run.runId, runDir: run.runDir, mandatHome: run.mandatHome, home: run.home, tree: "base", treeDir: base.dir,
        testsCommand: "npx vitest run --reporter=json --outputFile=$MANDAT_REPORT", testsEnv: { CI: "true" }, images: env.images, timeoutMs: 600_000,
        infraUser: env.user, extraCa: env.host.extraCa, ipv6Sysctl: env.ipv6Sysctl,
      });
      expect(r.ok).toBe(true);
      if (!r.ok || !r.report.valid) throw new Error("report invalid");
      expect([...r.report.tests].filter(([, s]) => s === "failed").map(([id]) => id)).toEqual([M]);
      expect(r.report.total).toBe(20);
      const manual = parseVitestReport(readFileSync(path.join(repoRoot, "fixtures/vitest-reports/base-1fail.json"), "utf8"), "/m/work");
      expect(manual.valid && [...manual.tests].sort()).toEqual([...r.report.tests].sort());
      expect(readFileSync(path.join(run.runDir, "gate", "base", "log", "events.jsonl"), "utf8")).toContain("policy_loaded");
    } finally {
      await cleanupRun(env.docker, run.runId);
    }
  });

  it("walking skeleton: honest-fix → VERIFIED (--json, 1 ред, 3 реда в дневника, 0 warn)", () => {
    const before = readLines(path.join(home, "ledger.jsonl")).length;
    const r = cli("run", "--contract", path.join(repoRoot, "contracts/fix-discount.json"), "--agent", "fake:honest-fix", "--json");
    const lines = r.stdout.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    const v = JSON.parse(lines[0] ?? "") as { result: string; exit: number; tree_sha: string | null; integrity: string; run_id: string };
    expect([v.result, v.exit, r.exit, v.integrity]).toEqual(["VERIFIED", 0, 0, "ok"]);
    expect(v.tree_sha).toMatch(/^[0-9a-f]{40}$/);
    const ledger = readLines(path.join(home, "ledger.jsonl"));
    expect(ledger.length - before).toBe(3);
    expect(verifyLedger(ledger).ok).toBe(true);
    const warn = readLines(path.join(home, "security_events.jsonl")).map((l) => JSON.parse(l) as { run_id: string; severity: string }).filter((e) => e.run_id === v.run_id && e.severity !== "info");
    expect(warn).toEqual([]);
  });

  it("skip-test → FAILED (20); echo-pass → UNKNOWN (10)", () => {
    const skip = cli("run", "--contract", path.join(repoRoot, "contracts/fix-discount.json"), "--agent", "fake:skip-test");
    expect(skip.exit).toBe(20);
    expect(skip.stdout).toContain(`VERDICT: FAILED  reasons: D2:skipped:${M}`);
    const echo = cli("run", "--contract", path.join(repoRoot, "contracts/fix-discount.json"), "--agent", "fake:echo-pass");
    expect(echo.exit).toBe(10);
    expect(echo.stdout).toContain("VERDICT: UNKNOWN");
  });
});

function readLines(f: string): string[] {
  try {
    return readFileSync(f, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
