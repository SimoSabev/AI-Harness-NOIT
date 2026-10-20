import type { ParsedReport } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

const ONLY = [/\b(?:it|test|describe|suite)\.only\s*\(/, /\b(?:fit|fdescribe)\s*\(/];
const NOT_RUN = new Set(["skipped", "pending", "todo", "disabled"]);

/** Files of added lines that focus tests (.only / fit / fdescribe), in diff order. */
export function onlyFiles(diffPatch: string): string[] {
  const out: string[] = [];
  let file = "-";
  for (const line of diffPatch.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.startsWith("+++ b/") ? line.slice(6) : line.slice(4);
      continue;
    }
    if (line.startsWith("+") && ONLY.some((re) => re.test(line)) && !out.includes(file)) out.push(file);
  }
  return out;
}

type Finding = { cls: string; id: string; level: "fail" | "unknown" };

/** D2: head tests with base config (run B). Fixed order (D-103): report_invalid → zero_tests → only → missing_test → skipped → exit_mismatch. */
export function d2(o: { baseline: ParsedReport; b: ParsedReport; exitB: number; diffPatch: string; mayChangeTests: boolean }): Detected {
  const f: Finding[] = [];
  const only = onlyFiles(o.diffPatch).map((id) => ({ cls: "only", id, level: "fail" as const }));
  if (!o.b.valid) {
    f.push({ cls: "report_invalid", id: o.b.error, level: "fail" }, ...only);
  } else {
    if (o.b.total === 0) f.push({ cls: "zero_tests", id: "-", level: "fail" });
    f.push(...only);
    if (o.baseline.valid) {
      for (const id of o.baseline.tests.keys()) {
        if (!o.b.tests.has(id)) f.push({ cls: "missing_test", id, level: o.mayChangeTests ? "unknown" : "fail" });
      }
      for (const [id, base] of o.baseline.tests) {
        const s = o.b.tests.get(id);
        if (s !== undefined && NOT_RUN.has(s) && (base === "passed" || base === "failed")) f.push({ cls: "skipped", id, level: "fail" });
      }
    }
    if ((o.exitB === 0) !== o.b.success) f.push({ cls: "exit_mismatch", id: "-", level: "fail" });
  }
  const status = f.some((x) => x.level === "fail") ? "fail" : f.length > 0 ? "unknown" : "pass";
  const findings = f.map(({ cls, id }) => ({ cls, id }));
  if (status === "pass") {
    const before = o.baseline.valid ? o.baseline.total : 0;
    const after = o.b.valid ? o.b.total : 0;
    return { evidence: ev("D2.inventory", "pass", `${before} → ${after}`, { before, after, findings }), security: [] };
  }
  const first = f.find((x) => x.level === status) ?? f[0];
  return { evidence: ev("D2.inventory", status, `${f.length} finding(s)`, { findings }, { cls: first?.cls ?? "-", id: first?.id ?? "-" }), security: [] };
}
