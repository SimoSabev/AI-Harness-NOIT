import type { VerdictResult } from "@mandat/contract";

// М4 (Х10, docs/prd/heavy-process.md, D-565): the final comparison. The same approved spec and the same hidden oracle,
// done once by the process (a job: planner, units, final check) and once by one agent in one task. The hidden oracle
// decides first (more hidden tests passed), then a VERIFIED verdict, then the lower cost, then the shorter time. Pure.

export interface ArmResult { verdict: VerdictResult | null; hidden_passed: number; hidden_total: number; usd: number; minutes: number; done: boolean }
export interface Comparison { winner: "process" | "single" | "tie" | "pending"; why: string }

export function compareArms(process: ArmResult, single: ArmResult): Comparison {
  if (!process.done || !single.done) return { winner: "pending", why: "an arm has not finished" };
  const steps: [string, (a: ArmResult) => number][] = [
    ["hidden tests passed", (a) => a.hidden_passed],
    ["a VERIFIED verdict", (a) => (a.verdict === "VERIFIED" ? 1 : 0)],
    ["lower cost", (a) => -Math.round(a.usd * 100)],
    ["shorter time", (a) => -Math.round(a.minutes)],
  ];
  for (const [why, score] of steps) {
    const p = score(process);
    const s = score(single);
    if (p !== s) return { winner: p > s ? "process" : "single", why };
  }
  return { winner: "tie", why: "equal on every measure" };
}

/** passed and total hidden tests from D5.hidden's evidence data */
export function hiddenCounts(evidence: readonly { detector: string; status: string; data: unknown }[]): { passed: number; total: number } {
  const e = evidence.find((x) => x.detector === "D5.hidden");
  const d = (e?.data ?? {}) as { passed?: unknown; total?: unknown; failed?: unknown };
  const failed = Array.isArray(d.failed) ? d.failed.length : 0;
  const passed = typeof d.passed === "number" ? d.passed : 0;
  const total = typeof d.total === "number" ? d.total : passed + failed;
  return { passed, total };
}
