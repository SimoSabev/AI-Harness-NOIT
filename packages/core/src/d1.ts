import type { ParsedReport } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

/** D1: base tests + config on head code (run A). Regressions = passed in baseline, not passed in A (D-120). */
/**
 * E7г / D-314: test IDs whose status differed between the two baseline runs of the connect step. Only valid reports
 * count; an ID present in one run only is flaky too. Sorted.
 */
export function flakyFrom(r1: ParsedReport, r2: ParsedReport): string[] {
  if (!r1.valid || !r2.valid) return [];
  const ids = new Set([...r1.tests.keys(), ...r2.tests.keys()]);
  return [...ids].filter((id) => r1.tests.get(id) !== r2.tests.get(id)).sort();
}

export function d1(baseline: ParsedReport, a: ParsedReport, flaky: readonly string[] = []): Detected {
  if (!a.valid) return { evidence: ev("D1.base_tests", "fail", `report A invalid: ${a.error}`, { error: a.error }, { cls: "report_invalid", id: a.error }), security: [] };
  if (!baseline.valid) return { evidence: ev("D1.base_tests", "fail", "baseline invalid", {}, { cls: "report_invalid", id: baseline.error }), security: [] };
  const skip = new Set(flaky);
  const all = [...baseline.tests].filter(([id, s]) => s === "passed" && a.tests.get(id) !== "passed").map(([id]) => id);
  const regressions = all.filter((id) => !skip.has(id));
  const flakySkipped = all.filter((id) => skip.has(id));
  const passed = [...a.tests.values()].filter((s) => s === "passed").length;
  if (regressions.length > 0) {
    return { evidence: ev("D1.base_tests", "fail", `${regressions.length} regression(s)`, { regressions }, { cls: "regression", id: regressions[0] ?? "-" }), security: [] };
  }
  return { evidence: ev("D1.base_tests", "pass", `${passed}/${a.total}${flakySkipped.length ? ` (${flakySkipped.length} flaky skipped)` : ""}`, { passed, total: a.total, ...(flakySkipped.length ? { flaky: flakySkipped } : {}) }), security: [] };
}
