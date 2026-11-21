import { describe, expect, it } from "vitest";
import { compareArms, hiddenCounts } from "./compare.js";
import type { ArmResult } from "./compare.js";

// М4 (Х10, D-565): the same task done by the process and by one agent; the hidden oracle decides, then the cost.
const arm = (o: Partial<ArmResult>): ArmResult => ({ verdict: "VERIFIED", hidden_passed: 10, hidden_total: 10, usd: 2, minutes: 30, done: true, ...o });

describe("compareArms (М4)", () => {
  it("more hidden tests passed wins; a tie goes to the verified one, then the cheaper, then the faster", () => {
    expect(compareArms(arm({}), arm({ hidden_passed: 8 })).winner).toBe("process");
    expect(compareArms(arm({ hidden_passed: 7 }), arm({ hidden_passed: 9 })).winner).toBe("single");
    expect(compareArms(arm({ verdict: "UNKNOWN" }), arm({})).winner).toBe("single");
    expect(compareArms(arm({ usd: 3 }), arm({ usd: 2 })).winner).toBe("single");
    expect(compareArms(arm({ minutes: 20 }), arm({ minutes: 40 })).winner).toBe("process");
    expect(compareArms(arm({}), arm({})).winner).toBe("tie");
  });
  it("an arm that has not finished cannot win; the reason names what decided it", () => {
    const r = compareArms(arm({}), arm({ done: false }));
    expect(r.winner).toBe("pending");
    expect(compareArms(arm({ hidden_passed: 9 }), arm({ hidden_passed: 10 })).why).toContain("hidden");
  });
  it("the hidden counts come from D5.hidden's evidence (passed / failed lists or counts)", () => {
    expect(hiddenCounts([{ detector: "D5.hidden", status: "fail", data: { failed: ["a", "b"], passed: 8 } }])).toEqual({ passed: 8, total: 10 });
    expect(hiddenCounts([{ detector: "D5.hidden", status: "pass", data: { passed: 12, total: 12 } }])).toEqual({ passed: 12, total: 12 });
    expect(hiddenCounts([])).toEqual({ passed: 0, total: 0 });
  });
});
