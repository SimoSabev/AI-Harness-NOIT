import type { ParsedReport } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";
import type { WeakenedAssertion } from "./test-ast.js";

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

export interface D2Input {
  baseline: ParsedReport;
  b: ParsedReport;
  exitB: number;
  diffPatch: string;
  mayChangeTests: boolean;
  /** Run A (base tests on head code); enables D2:weakened (D-233). */
  a?: ParsedReport;
  /** AST findings (test-ast.weakenedAssertions) for test files changed in the diff. */
  weakenedAssertions?: WeakenedAssertion[];
  /** Static count of declared tests in tree B; null when tests are generated (S31). */
  declaredTests?: number | null;
  /** --external: weakened assertions are fail even with may_change_tests from the policy. */
  external?: boolean;
}

/**
 * D2: head tests with base config (run B). Fixed order (D-103, D-233): report_invalid → zero_tests → only → missing_test →
 * weakened → weakened_assertions → skipped → exit_mismatch → report_mismatch (D-268).
 */
export function d2(o: D2Input): Detected {
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
    }
    if (o.a?.valid) {
      for (const [id, sa] of o.a.tests) {
        if (sa === "failed" && o.b.tests.get(id) === "passed") f.push({ cls: "weakened", id, level: o.mayChangeTests ? "unknown" : "fail" });
      }
    }
    for (const w of o.weakenedAssertions ?? []) {
      const level = w.level === "unknown" ? "unknown" : o.external || !o.mayChangeTests ? "fail" : "unknown";
      f.push({ cls: "weakened_assertions", id: w.id, level });
    }
    if (o.baseline.valid) {
      for (const [id, base] of o.baseline.tests) {
        const s = o.b.tests.get(id);
        if (s !== undefined && NOT_RUN.has(s) && (base === "passed" || base === "failed")) f.push({ cls: "skipped", id, level: "fail" });
      }
    }
    if ((o.exitB === 0) !== o.b.success) f.push({ cls: "exit_mismatch", id: "-", level: "fail" });
    if (o.declaredTests !== undefined && o.declaredTests !== null) {
      const passed = [...o.b.tests.values()].filter((x) => x === "passed").length;
      if (passed > o.declaredTests) f.push({ cls: "report_mismatch", id: "-", level: "unknown" });
    }
  }
  const status = f.some((x) => x.level === "fail") ? "fail" : f.length > 0 ? "unknown" : "pass";
  const findings = f.map(({ cls, id }) => ({ cls, id }));
  if (status === "pass") {
    const before = o.baseline.valid ? o.baseline.total : 0;
    const after = o.b.valid ? o.b.total : 0;
    return { evidence: ev("D2.inventory", "pass", `${before} → ${after}`, { before, after, findings }), security: [] };
  }
  const first = f.find((x) => x.level === status) ?? f[0];
  const before = o.baseline.valid ? o.baseline.total : null;
  const after = o.b.valid ? o.b.total : null;
  return { evidence: ev("D2.inventory", status, `${f.length} finding(s)`, { findings, before, after }, { cls: first?.cls ?? "-", id: first?.id ?? "-" }), security: [] };
}
