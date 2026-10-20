import type { ParsedReport } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

/** D1: base tests + config on head code (run A). Regressions = passed in baseline, not passed in A (D-120). */
export function d1(baseline: ParsedReport, a: ParsedReport): Detected {
  if (!a.valid) return { evidence: ev("D1.base_tests", "fail", `report A invalid: ${a.error}`, { error: a.error }, { cls: "report_invalid", id: a.error }), security: [] };
  if (!baseline.valid) return { evidence: ev("D1.base_tests", "fail", "baseline invalid", {}, { cls: "report_invalid", id: baseline.error }), security: [] };
  const regressions = [...baseline.tests].filter(([id, s]) => s === "passed" && a.tests.get(id) !== "passed").map(([id]) => id);
  const passed = [...a.tests.values()].filter((s) => s === "passed").length;
  if (regressions.length > 0) {
    return { evidence: ev("D1.base_tests", "fail", `${regressions.length} regression(s)`, { regressions }, { cls: "regression", id: regressions[0] ?? "-" }), security: [] };
  }
  return { evidence: ev("D1.base_tests", "pass", `${passed}/${a.total}`, { passed, total: a.total }), security: [] };
}
