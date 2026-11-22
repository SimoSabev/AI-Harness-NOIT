import { describe, expect, it } from "vitest";
import type { ParsedReport, TestStatus } from "@mandat/contract";
import { d5Hidden, hiddenId, splitHidden } from "./d5.js";

// v5 E9б (5.2): D5 hidden tests — a person's tests the agent never sees, copied into tree B only. Their names never
// reach the agent: the signature carries a hash, the evidence is not agent-visible.
const report = (tests: Record<string, TestStatus>): ParsedReport => ({ valid: true, success: !Object.values(tests).includes("failed"), total: Object.keys(tests).length, tests: new Map(Object.entries(tests)) });
const B = report({ "tests/cart.spec.ts > cart > adds": "passed", "tests/__hidden__/cart.spec.ts > hidden > rounds down": "failed", "tests/__hidden__/cart.spec.ts > hidden > over 50": "passed" });

describe("D5 hidden tests (E9б)", () => {
  it("splits the report: the visible tests go on to D1/D2/MUST_PASS, the hidden ones to D5", () => {
    const s = splitHidden(B, ["tests/__hidden__/cart.spec.ts"]);
    expect(s.visible.valid && [...s.visible.tests.keys()]).toEqual(["tests/cart.spec.ts > cart > adds"]);
    expect(s.visible.valid && s.visible.total).toBe(1);
    expect(s.hidden.map((h) => h.id)).toEqual(["tests/__hidden__/cart.spec.ts > hidden > rounds down", "tests/__hidden__/cart.spec.ts > hidden > over 50"]);
  });
  it("a failing hidden test → fail D5:hidden_fail:<hash>, never its name; not agent-visible; the names only in data", () => {
    const e = d5Hidden({ hidden: splitHidden(B, ["tests/__hidden__/cart.spec.ts"]).hidden, files: 1 }).evidence;
    expect(e).toMatchObject({ detector: "D5.hidden", status: "fail", agent_visible: false, signature: `D5:hidden_fail:${hiddenId("tests/__hidden__/cart.spec.ts > hidden > rounds down")}` });
    expect(e.signature).not.toContain("rounds");
    expect(e.summary).toBe("1 of 2 hidden test(s) failed");
    expect(e.data).toEqual({ failed: ["tests/__hidden__/cart.spec.ts > hidden > rounds down"], passed: 1, total: 2 });
    expect(hiddenId("x")).toMatch(/^h[0-9a-f]{8}$/);
  });
  it("D-574: with a scope (a job unit) only its criteria and the U- tests decide; met lists the criteria fully green anywhere", () => {
    const h = (id: string, status: "passed" | "failed") => ({ id: `tests/__hidden__/a.spec.ts > g > ${id}: x`, status });
    const hidden = [h("AC-1", "passed"), h("AC-3", "passed"), h("AC-3", "passed"), h("AC-5", "failed"), h("U-1", "passed")];
    const e = d5Hidden({ hidden, files: 1, scope: ["AC-1"] }).evidence;
    expect(e.status).toBe("pass");
    expect(e.data).toEqual({ passed: 2, total: 2, met: ["AC-1", "AC-3"] });
    const f = d5Hidden({ hidden: [...hidden, h("U-2", "failed")], files: 1, scope: ["AC-1"] }).evidence;
    expect(f).toMatchObject({ status: "fail", data: { failed: ["tests/__hidden__/a.spec.ts > g > U-2: x"], passed: 2, total: 3, met: ["AC-1", "AC-3"] } });
    // no test of the scope ran at all: not a silent pass
    expect(d5Hidden({ hidden: [h("AC-5", "failed")], files: 1, scope: ["AC-1"] }).evidence).toMatchObject({ status: "unknown" });
  });
  it("all hidden tests passed → pass; no report → unknown not_run", () => {
    expect(d5Hidden({ hidden: [{ id: "a", status: "passed" }], files: 1 }).evidence).toMatchObject({ status: "pass", summary: "1/1 hidden test(s) passed" });
    expect(d5Hidden({ hidden: [], files: 2, reportValid: false }).evidence).toMatchObject({ status: "unknown", signature: "D5:not_run:2" });
  });
  it("D-536: hidden files copied but zero hidden results in a valid report → UNKNOWN not_discovered, never a silent pass", () => {
    const e = d5Hidden({ hidden: [], files: 2, reportValid: true }).evidence;
    expect(e).toMatchObject({ status: "unknown", signature: "D5:not_discovered:2", agent_visible: false });
    expect(e.summary).toContain("the test runner did not pick up the 2 hidden test file(s)");
    expect(e.summary).toContain("put them where the project's runner finds them");
  });
  it("D-536: hidden files at any depth, from the repo root; only the copied files count, not a look-alike __hidden__ folder", () => {
    const M = report({
      "packages/engine/src/vec3.spec.ts > adds": "passed",
      "packages/engine/test/__hidden__/vec3.spec.ts > AC-1: adds": "failed",
      "packages/ui/__hidden__/fake.spec.ts > AC-1: adds": "passed",
    });
    const s = splitHidden(M, ["packages/engine/test/__hidden__/vec3.spec.ts"]);
    expect(s.hidden).toEqual([{ id: "packages/engine/test/__hidden__/vec3.spec.ts > AC-1: adds", status: "failed" }]);
    expect(s.visible.valid && [...s.visible.tests.keys()]).toEqual(["packages/engine/src/vec3.spec.ts > adds", "packages/ui/__hidden__/fake.spec.ts > AC-1: adds"]);
    // the copied files did not run, the writer's own look-alike did: still not discovered, not a pass
    expect(splitHidden(M, ["packages/x/__hidden__/never.spec.ts"]).hidden).toEqual([]);
  });
});
