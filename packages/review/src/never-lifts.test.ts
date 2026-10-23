import { describe, expect, it } from "vitest";
import { effectiveLevel } from "@mandat/contract";
import type { Evidence, VerdictResult } from "@mandat/contract";
import { decideVerdict, ev } from "@mandat/core";

// v5 E9б (AC-7.4): the advisor can never turn FAILED into VERIFIED or lift a level — for every combination of detector
// statuses, adding a REVIEW evidence (pass, unknown or n/a) gives a result and a level no better than without it.
const RANK: Record<VerdictResult, number> = { FAILED: 0, UNKNOWN: 1, VERIFIED: 2 };
const STATUSES = ["pass", "fail", "unknown", "n/a"] as const;

describe("the advisor never lifts (AC-7.4)", () => {
  it("every detector combination × every REVIEW status × every level input", () => {
    let cases = 0;
    for (const a of STATUSES) for (const b of STATUSES) for (const c of STATUSES) {
      const base: Evidence[] = [ev("D1.base_tests", a, "x", {}, { cls: "x", id: "-" }), ev("D2.inventory", b, "x", {}, { cls: "x", id: "-" }), ev("MUST_PASS", c, "x", {}, { cls: "x", id: "-" })];
      const without = decideVerdict(base);
      for (const r of ["pass", "unknown", "n/a"] as const) {
        const withReview = decideVerdict([...base, ev("REVIEW", r, "advisor", {}, { cls: "high", id: "p" })]);
        expect(RANK[withReview]).toBeLessThanOrEqual(RANK[without]);
        for (const ladder of [0, 1, 2, 3]) for (const riskCap of [0, 1, 2, 3]) for (const rulesetStrict of [true, false]) {
          const lv = (result: VerdictResult) => effectiveLevel({ ladder, riskCap, result, mode: "full", levelCap: 3, rulesetStrict, d7: "pass" }).level;
          expect(lv(withReview)).toBeLessThanOrEqual(lv(without));
          cases++;
        }
      }
    }
    expect(cases).toBe(64 * 3 * 32);
  });
});
