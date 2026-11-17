import { describe, expect, it } from "vitest";
import { ORACLE_DIR, ORACLE_MIN_KILL } from "@mandat/contract";
import { decideVerdict } from "./verdict.js";
import type { ParsedReport, Spec, TestStatus } from "@mandat/contract";
import { classifyRedOnBase, d11Oracle, oracleChange } from "./oracle.js";
import { splitHidden } from "./d5.js";
import type { MutantRun, MutationSite } from "./d11.js";

// D-534 (М1 Х3): the oracle is checked on the base before the writer starts, and graded with the writer's mutants.
const spec: Spec = {
  goal: "Round discounts half up",
  product: "",
  criteria: [
    { id: "AC-1", when: "a discount ends in .5", shall: "round it up", proof: "tests" },
    { id: "AC-2", when: "a discount is negative", shall: "be 0", proof: "tests" },
    { id: "AC-3", when: "someone reads the receipt", shall: "find it clear", proof: "human" },
  ],
  unchanged: ["whole-number totals"],
  out_of_scope: [],
  profile: "feature",
};
const f = (name: string) => `${ORACLE_DIR}/cart.spec.ts > ${name}`;
const r = (xs: [string, TestStatus][]) => xs.map(([name, status]) => ({ id: f(name), status }));
const good: [string, TestStatus][] = [["AC-1: rounds .5 up", "failed"], ["AC-2: negative is 0", "failed"], ["U-1: whole totals stay", "passed"]];

describe("the oracle's change (D-534)", () => {
  it("only test files under the oracle directory; any other file is a problem; none at all is a problem", () => {
    expect(oracleChange({ paths: [`${ORACLE_DIR}/b.spec.ts`, `${ORACLE_DIR}/a/x.test.ts`], dir: ORACLE_DIR })).toEqual({ tests: ["a/x.test.ts", "b.spec.ts"], problems: [] });
    expect(oracleChange({ paths: [`${ORACLE_DIR}/a.spec.ts`, "src/cart.ts", `${ORACLE_DIR}/helper.ts`], dir: ORACLE_DIR }).problems).toEqual([
      { kind: "non_test_change", id: "src/cart.ts" },
      { kind: "non_test_change", id: `${ORACLE_DIR}/helper.ts` },
    ]);
    expect(oracleChange({ paths: ["src/cart.ts"], dir: ORACLE_DIR }).problems.map((p) => p.kind)).toEqual(["non_test_change", "no_tests"]);
  });
});

describe("red on base (D-534)", () => {
  it("criteria red, unchanged green, every test tagged → ready; red_on_base per criterion (a human criterion needs no test)", () => {
    expect(classifyRedOnBase({ spec, results: r(good) })).toEqual({
      ready: true,
      red_on_base: [{ criterion_id: "AC-1", red: true }, { criterion_id: "AC-2", red: true }, { criterion_id: "AC-3", red: false }],
      problems: [],
    });
  });
  const table: [string, [string, TestStatus][], { kind: string; id: string }[]][] = [
    ["a criterion with no tagged test", [good[0]!, good[2]!], [{ kind: "untagged_criterion", id: "AC-2" }]],
    ["a new-behavior test already green", [good[0]!, ["AC-2: negative is 0", "passed"], good[2]!], [{ kind: "green_on_base", id: "AC-2" }]],
    ["one of two tests of a criterion green", [...good, ["AC-1: also .5 on totals", "passed"]], [{ kind: "green_on_base", id: "AC-1" }]],
    ["an unchanged test red", [good[0]!, good[1]!, ["U-1: whole totals stay", "failed"]], [{ kind: "unchanged_red", id: "U-1" }]],
    ["an unchanged behavior without a test", [good[0]!, good[1]!], [{ kind: "unchanged_untagged", id: "U-1" }]],
    ["a test without a tag", [...good, ["rounds things", "failed"]], [{ kind: "untagged_test", id: "1" }]],
    ["a tag the spec does not have", [...good, ["AC-9: something else", "failed"]], [{ kind: "unknown_tag", id: "AC-9" }]],
    ["a skipped criterion test", [["AC-1: rounds .5 up", "skipped"], good[1]!, good[2]!], [{ kind: "not_run", id: "AC-1" }]],
  ];
  for (const [what, results, problems] of table) {
    it(`${what} → not ready, and the result says why`, () => {
      const c = classifyRedOnBase({ spec, results: r(results) });
      expect(c.ready).toBe(false);
      expect(c.problems).toEqual(problems);
      expect(JSON.stringify(c.problems)).not.toContain("rounds");
    });
  }
  it("no results (the tests did not run) → not ready", () => {
    expect(classifyRedOnBase({ spec, results: [] }).problems).toEqual([{ kind: "not_run", id: "-" }]);
    expect(classifyRedOnBase({ spec, results: null }).ready).toBe(false);
  });
});

describe("the oracle graded with the writer's mutants (D-534)", () => {
  const site = (n: number): MutationSite => ({ path: "src/cart.ts", line: n, col: 0, from: "5000", to: "0" });
  const report = (xs: [string, TestStatus][]): ParsedReport => ({ valid: true, success: !xs.some(([, s]) => s === "failed"), total: xs.length, tests: new Map(xs.map(([n, s]) => [f(n), s])) });
  const hiddenOf = (rep: ParsedReport) => splitHidden(rep, ORACLE_DIR).hidden;
  const onB = hiddenOf(report([["AC-1: x", "passed"], ["AC-2: y", "passed"]]));
  const caught: MutantRun = { exit: 1, timedOut: false, report: report([["AC-1: x", "failed"], ["AC-2: y", "passed"]]) };
  // a visible test failing kills the mutant for D11, but only the oracle's own tests count for D11.oracle
  const missed: MutantRun = { exit: 1, timedOut: false, report: report([["AC-1: x", "passed"], ["AC-2: y", "passed"]]) };
  const grade = (runs: (MutantRun | null)[], threshold = ORACLE_MIN_KILL) => d11Oracle({ sites: runs.map((_, k) => site(k + 1)), runs, hiddenOf, hiddenOnB: onB, threshold }).evidence;
  it("at or above the threshold → pass with the score; never agent-visible", () => {
    const e = grade([caught, caught, missed]);
    expect(e).toMatchObject({ detector: "D11.oracle", status: "pass", agent_visible: false, data: { killed: 2, total: 3, threshold: ORACLE_MIN_KILL } });
  });
  it("below the threshold → UNKNOWN „oracle too weak“, so the verdict cannot be VERIFIED", () => {
    const e = grade([caught, missed, missed]);
    expect(e).toMatchObject({ status: "unknown", signature: "D11:oracle_too_weak:1/3", agent_visible: false, data: { killed: 1, total: 3 } });
    expect(e.summary).toContain("oracle too weak");
    expect(decideVerdict([{ ...e, status: "pass" }])).toBe("VERIFIED");
    expect(decideVerdict([e])).toBe("UNKNOWN");
  });
  it("a timeout or a broken report counts as caught; a mutant not run → UNKNOWN not_run; no sites → n/a", () => {
    expect(grade([{ ...missed, timedOut: true }, { exit: 1, timedOut: false, report: { valid: false, error: "json", detail: "x" } }]).status).toBe("pass");
    expect(grade([caught, null]).signature).toBe("D11:not_run:-");
    expect(d11Oracle({ sites: [], runs: [], hiddenOf, hiddenOnB: onB, threshold: 0.6 }).evidence.status).toBe("n/a");
  });
});
