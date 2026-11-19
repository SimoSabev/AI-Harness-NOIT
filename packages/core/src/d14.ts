import type { Evidence, ParsedReport } from "@mandat/contract";
import { ev, na } from "./evidence.js";

// D-548 (М3 Х8, docs/prd/heavy-process.md §8 „бюджети за производителност“): the result may not make the project's own
// tests much slower. Per test that passed on base and on run A: slower than ratio × base AND by more than min_ms; and
// the whole suite (the same tests summed): slower than suite_ratio × AND by more than suite_min_ms. Timing is noisy
// (another load, a cached baseline), so the thresholds are wide and an overrun is unknown — a person looks — never fail.

export const PERF_BUDGET = Object.freeze({ ratio: 3, min_ms: 500, suite_ratio: 1.5, suite_min_ms: 5000, list: 10 });

export function d14Perf(o: { baseline: ParsedReport; a: ParsedReport; budget?: typeof PERF_BUDGET }): Evidence {
  const b = o.budget ?? PERF_BUDGET;
  if (!o.baseline.valid || !o.a.valid || !o.baseline.durations || !o.a.durations) return na("D14.perf", "no test times");
  const before = o.baseline.durations;
  const after = o.a.durations;
  const common = [...before.keys()].filter((id) => after.has(id) && o.baseline.valid && o.baseline.tests.get(id) === "passed" && o.a.valid && o.a.tests.get(id) === "passed");
  if (common.length === 0) return na("D14.perf", "no test timed on both");
  const slower = common
    .map((id) => ({ id, base_ms: Math.round(before.get(id) ?? 0), ms: Math.round(after.get(id) ?? 0) }))
    .filter((t) => t.ms > t.base_ms * b.ratio && t.ms - t.base_ms > b.min_ms)
    .sort((x, y) => y.ms - y.base_ms - (x.ms - x.base_ms));
  const sum = (m: Map<string, number>) => Math.round(common.reduce((s, id) => s + (m.get(id) ?? 0), 0));
  const suite = { base_ms: sum(before), ms: sum(after), tests: common.length };
  const suiteOver = suite.ms > suite.base_ms * b.suite_ratio && suite.ms - suite.base_ms > b.suite_min_ms;
  const first = slower[0];
  if (first) return ev("D14.perf", "unknown", `${slower.length} test(s) much slower, first ${first.id}: ${first.base_ms} → ${first.ms} ms`, { slower: slower.slice(0, b.list), suite }, { cls: "slower", id: first.id });
  if (suiteOver) return ev("D14.perf", "unknown", `the suite is much slower: ${suite.base_ms} → ${suite.ms} ms over ${suite.tests} test(s)`, { slower: [], suite }, { cls: "slower", id: "suite" });
  return ev("D14.perf", "pass", `${suite.tests} test(s) within the time budget (${suite.base_ms} → ${suite.ms} ms)`, { suite });
}
