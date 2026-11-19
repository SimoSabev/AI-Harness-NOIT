import { describe, expect, it } from "vitest";
import { parseVitestReport } from "@mandat/contract";
import { PERF_BUDGET, d14Perf } from "./d14.js";

// D-548 (М3 Х8): a budget for speed. A test that passed on base and on the result may not get much slower; the
// thresholds are wide (timing is noisy) and an overrun is a question for a person (unknown), never a refusal.
const report = (tests: [string, number | undefined][]) =>
  parseVitestReport(
    JSON.stringify({
      numTotalTests: tests.length, success: true,
      testResults: [{ name: "/m/work/tests/a.spec.ts", status: "passed", assertionResults: tests.map(([title, duration]) => ({ ancestorTitles: ["a"], title, status: "passed", ...(duration === undefined ? {} : { duration }) })) }],
    }),
    "/m/work",
  );

describe("D14.perf (D-548)", () => {
  it("the report keeps each test's duration", () => {
    const r = report([["x", 12.5], ["y", undefined]]);
    expect(r.valid && r.durations?.get("tests/a.spec.ts > a > x")).toBe(12.5);
    expect(r.valid && r.durations?.has("tests/a.spec.ts > a > y")).toBe(false);
  });
  it("within the budget → pass; noise under the floor does not count", () => {
    const base = report([["x", 100], ["y", 5]]);
    expect(d14Perf({ baseline: base, a: report([["x", 150], ["y", 40]]) }).status).toBe("pass");
  });
  it("a test many times slower over the floor → unknown with its id; the slowest first", () => {
    const base = report([["x", 100], ["y", 100]]);
    const e = d14Perf({ baseline: base, a: report([["x", 100 * PERF_BUDGET.ratio + PERF_BUDGET.min_ms], ["y", 2000]]) });
    expect(e.status).toBe("unknown");
    expect(e.signature).toContain("slower");
    expect((e.data as { slower: { id: string }[] }).slower.map((s) => s.id)).toEqual(["tests/a.spec.ts > a > y", "tests/a.spec.ts > a > x"]);
  });
  it("the whole suite much slower over its floor → unknown even when no single test is", () => {
    const n = 60;
    const names = Array.from({ length: n }, (_, k): [string, number] => [`t${k}`, 100]);
    const slow = names.map(([t]): [string, number] => [t, 290]);
    const e = d14Perf({ baseline: report(names), a: report(slow) });
    expect(e.status).toBe("unknown");
    expect(e.summary).toContain("suite");
  });
  it("no durations, an invalid report or no common tests → n/a", () => {
    expect(d14Perf({ baseline: report([["x", undefined]]), a: report([["x", undefined]]) }).status).toBe("n/a");
    expect(d14Perf({ baseline: parseVitestReport(null, "/m/work"), a: report([["x", 1]]) }).status).toBe("n/a");
  });
});
