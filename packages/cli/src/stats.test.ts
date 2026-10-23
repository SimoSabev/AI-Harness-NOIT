import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatStats, readVerdicts, runStats } from "./commands/stats.js";

// Calibration after the first real tasks: how often the judge asks a human (UNKNOWN), why, and what a task costs.
const v = (result: string, reasons: string[], agent = "claude", usd = 0.4, ms = 300_000, created = "2026-10-23T10:00:00.000Z") => ({ result, reasons, agent, usage: { usd }, timings_ms: { total: ms }, created_at: created });

describe("mandat stats", () => {
  it("shares by result, the top reason classes, mean cost and time, by agent; fake agents apart", () => {
    const s = runStats([
      v("VERIFIED", []), v("VERIFIED", []), v("UNKNOWN", ["D11:survived:src/a.ts:3"]), v("UNKNOWN", ["D11:survived:src/b.ts:9", "D3:protected_path:.github/**"]),
      v("FAILED", ["D2:missing_test:t > x"]), v("VERIFIED", [], "fake:honest-fix", 0, 1000),
    ], { includeFakes: false });
    expect(s.total).toBe(5);
    expect(s.byResult).toEqual({ VERIFIED: 2, UNKNOWN: 2, FAILED: 1 });
    expect(s.unknownShare).toBeCloseTo(0.4);
    expect(s.topReasons).toEqual([{ cls: "D11:survived", n: 2 }, { cls: "D2:missing_test", n: 1 }, { cls: "D3:protected_path", n: 1 }]);
    expect(s.meanUsd).toBeCloseTo(0.4);
    expect(s.meanMinutes).toBeCloseTo(5);
    expect(s.byAgent).toEqual({ claude: { total: 5, VERIFIED: 2, UNKNOWN: 2, FAILED: 1 } });
    expect(runStats([v("VERIFIED", [], "fake:x")], { includeFakes: true }).total).toBe(1);
  });
  it("the advice: UNKNOWN over 40% → the judge is too nervous; any FAILED/UNKNOWN with no reason is flagged; nothing yet → says so", () => {
    expect(formatStats(runStats([v("UNKNOWN", ["D11:survived:a:1"]), v("UNKNOWN", ["D11:survived:b:1"]), v("VERIFIED", [])], { includeFakes: false }))).toContain("over 40%");
    expect(formatStats(runStats([], { includeFakes: false }))).toContain("no real runs yet");
  });
  it("reads runs/*/verdict.json under the home, skipping broken files and keeping --since", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-stats-"));
    for (const [id, body] of [["r1", JSON.stringify(v("VERIFIED", [], "claude", 0.1, 60_000, "2026-10-20T00:00:00.000Z"))], ["r2", JSON.stringify(v("FAILED", ["D1:regression:x"]))], ["r3", "{broken"]] as const) {
      mkdirSync(path.join(home, "runs", id), { recursive: true });
      writeFileSync(path.join(home, "runs", id, "verdict.json"), body);
    }
    expect(readVerdicts(home).length).toBe(2);
    expect(readVerdicts(home, Date.parse("2026-10-22T00:00:00.000Z")).length).toBe(1);
  });
});
