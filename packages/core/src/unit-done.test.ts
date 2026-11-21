import { describe, expect, it } from "vitest";
import { criteriaMet } from "./unit-done.js";

// D-573 (live test 21.11): an earlier unit already built what this unit was for; its agent changed nothing and the job
// parked. The hidden tests of the last landed verdict tell whether this unit's criteria already pass.
const fail = (...ids: string[]) => ({ status: "fail", data: { failed: ids.map((id) => `tests/__hidden__/a.spec.ts > g > ${id}: x`), passed: 20 - ids.length, total: 20 } });

describe("criteriaMet (D-573)", () => {
  it("a passing D5 meets every criterion; a failing one meets those none of its failed tests name", () => {
    expect(criteriaMet(["AC-3", "AC-4"], { status: "pass", data: { passed: 20, total: 20 } })).toBe(true);
    expect(criteriaMet(["AC-3", "AC-4"], fail("AC-1", "AC-10", "U-2"))).toBe(true);
    expect(criteriaMet(["AC-3", "AC-4"], fail("AC-1", "AC-4"))).toBe(false);
  });
  it("no evidence, no hidden tests, a capped failed list or no criteria never count as met", () => {
    expect(criteriaMet(["AC-3"], null)).toBe(false);
    expect(criteriaMet(["AC-3"], { status: "pass", data: { passed: 0, total: 0 } })).toBe(false);
    expect(criteriaMet(["AC-3"], { status: "fail", data: { failed: Array.from({ length: 50 }, (_, k) => `a > AC-${k + 100}: x`), passed: 0, total: 80 } })).toBe(false);
    expect(criteriaMet([], { status: "pass", data: { passed: 3, total: 3 } })).toBe(false);
    expect(criteriaMet(["AC-3"], { status: "unknown", data: {} })).toBe(false);
  });
});
