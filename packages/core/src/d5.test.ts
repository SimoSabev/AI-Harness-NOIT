import { describe, expect, it } from "vitest";
import type { ParsedReport, TestStatus } from "@mandat/contract";
import { d5Hidden, hiddenId, splitHidden } from "./d5.js";

// v5 E9б (5.2): D5 hidden tests — a person's tests the agent never sees, copied into tree B only. Their names never
// reach the agent: the signature carries a hash, the evidence is not agent-visible.
const report = (tests: Record<string, TestStatus>): ParsedReport => ({ valid: true, success: !Object.values(tests).includes("failed"), total: Object.keys(tests).length, tests: new Map(Object.entries(tests)) });
const B = report({ "tests/cart.spec.ts > cart > adds": "passed", "tests/__hidden__/cart.spec.ts > hidden > rounds down": "failed", "tests/__hidden__/cart.spec.ts > hidden > over 50": "passed" });

describe("D5 hidden tests (E9б)", () => {
  it("splits the report: the visible tests go on to D1/D2/MUST_PASS, the hidden ones to D5", () => {
    const s = splitHidden(B, "tests/__hidden__");
    expect(s.visible.valid && [...s.visible.tests.keys()]).toEqual(["tests/cart.spec.ts > cart > adds"]);
    expect(s.visible.valid && s.visible.total).toBe(1);
    expect(s.hidden.map((h) => h.id)).toEqual(["tests/__hidden__/cart.spec.ts > hidden > rounds down", "tests/__hidden__/cart.spec.ts > hidden > over 50"]);
  });
  it("a failing hidden test → fail D5:hidden_fail:<hash>, never its name; not agent-visible; the names only in data", () => {
    const e = d5Hidden({ hidden: splitHidden(B, "tests/__hidden__").hidden, files: 1 }).evidence;
    expect(e).toMatchObject({ detector: "D5.hidden", status: "fail", agent_visible: false, signature: `D5:hidden_fail:${hiddenId("tests/__hidden__/cart.spec.ts > hidden > rounds down")}` });
    expect(e.signature).not.toContain("rounds");
    expect(e.summary).toBe("1 of 2 hidden test(s) failed");
    expect(e.data).toEqual({ failed: ["tests/__hidden__/cart.spec.ts > hidden > rounds down"] });
    expect(hiddenId("x")).toMatch(/^h[0-9a-f]{8}$/);
  });
  it("all hidden tests passed → pass; hidden files that the runner did not run → unknown not_run", () => {
    expect(d5Hidden({ hidden: [{ id: "a", status: "passed" }], files: 1 }).evidence).toMatchObject({ status: "pass", summary: "1/1 hidden test(s) passed" });
    expect(d5Hidden({ hidden: [], files: 2 }).evidence).toMatchObject({ status: "unknown", signature: "D5:not_run:2" });
  });
});
