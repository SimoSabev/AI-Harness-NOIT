import type { ParsedReport } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

export function mustPass(o: { ids: string[]; a: ParsedReport; b: ParsedReport }): Detected {
  const ok = (r: ParsedReport, id: string) => r.valid && r.tests.get(id) === "passed";
  const notPassed = o.ids.filter((id) => !ok(o.a, id) || !ok(o.b, id));
  if (notPassed.length === 0) return { evidence: ev("MUST_PASS", "pass", `${o.ids.length}/${o.ids.length}`, { ids: o.ids }), security: [] };
  return { evidence: ev("MUST_PASS", "fail", `${notPassed.length} must-pass test(s) not passed`, { not_passed: notPassed }, { cls: "not_passed", id: notPassed[0] ?? "-" }), security: [] };
}
