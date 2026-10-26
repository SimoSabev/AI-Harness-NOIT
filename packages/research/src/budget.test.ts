import { describe, expect, it } from "vitest";
import { depthBudget } from "@mandat/contract";
import { Budget } from "./budget.js";

describe("the budget of a run (AC-13.7)", () => {
  it("money: gathering stops when only the writer's reserve is left", () => {
    const b = new Budget({ ...depthBudget("standard"), usd: 0.5 }, Number.MAX_SAFE_INTEGER);
    b.spend(0.39);
    expect(b.exhausted()).toBeNull();
    b.spend(0.02);
    expect(b.exhausted()).toBe("budget");
    expect(b.canQuery()).toBe(false);
    expect(b.reason).toBe("budget");
  });
  it("tokens count too (a subscription or a local model costs $0 but not 0 tokens)", () => {
    const b = new Budget({ ...depthBudget("quick"), tokens: 1000 }, Number.MAX_SAFE_INTEGER);
    b.spend(0, 700, 99);
    expect(b.exhausted()).toBeNull();
    b.spend(0, 0, 1);
    expect(b.exhausted()).toBe("budget");
  });
  it("pages and queries are counted against the depth", () => {
    const b = new Budget({ ...depthBudget("quick"), pages: 2, queries: 1 }, Number.MAX_SAFE_INTEGER);
    b.query();
    expect(b.canQuery()).toBe(false);
    b.page();
    b.page();
    expect(b.canRead()).toBe(false);
    expect(b.exhausted()).toBeNull();
  });
  it("time and an explicit stop", () => {
    let t = 0;
    const b = new Budget(depthBudget("quick"), 100, () => t);
    expect(b.exhausted()).toBeNull();
    t = 100;
    expect(b.exhausted()).toBe("timeout");
    const c = new Budget(depthBudget("quick"), Number.MAX_SAFE_INTEGER);
    c.stop("stopped");
    c.stop("budget");
    expect(c.exhausted()).toBe("stopped");
  });
});
