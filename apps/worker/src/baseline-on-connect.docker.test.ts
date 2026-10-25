import { cpSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { dirView, propose, scanRepo } from "@mandat/onboard";
import { runBaseline } from "./baseline.js";
import { dockerEnv, repoRoot, tempRun } from "./testing.js";

// E7г (AC-1.2, D-314): the baseline of a repo = its base tests run twice in the real sandbox.
beforeAll(async () => {
  await dockerEnv(); // images present
});

describe("baseline on connect (docker)", () => {
  it("demo-shop: two runs → valid report, the test count, no flaky; the proposal carries it", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "baseline-shop-"));
    cpSync(path.join(repoRoot, "fixtures", "demo-shop"), dir, { recursive: true, filter: (p) => !p.includes("node_modules") });
    const scan = scanRepo(dirView(dir));
    const run = tempRun();
    const b = await runBaseline(dir, propose(scan).policy, { mandatHome: run.mandatHome, repoRoot });
    expect(b.report_valid).toBe(true);
    expect(b.test_ids_count).toBeGreaterThan(0);
    expect(b.flaky).toEqual([]);
    const p = propose(scan, { baseline: b });
    expect(p.policy.tests.flaky).toBeUndefined();
    expect(p.suggested_tasks).toEqual([]);
  });
});
