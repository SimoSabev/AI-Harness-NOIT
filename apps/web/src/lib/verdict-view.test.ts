import { describe, expect, it } from "vitest";
import { failureLayer, primaryAction, reasonText, testsLine, testsOf, verdictView } from "./verdict-view";

describe("verdict view (Ф4 карта)", () => {
  it("знак + дума + цвят (WCAG 1.4.1)", () => {
    expect(verdictView("VERIFIED")).toEqual({ sign: "✔", word: "VERIFIED", tone: "verified" });
    expect(verdictView("VERIFIED", "bg")).toEqual({ sign: "✔", word: "ПРОВЕРЕНО", tone: "verified" });
    expect(verdictView("FAILED", "bg")).toEqual({ sign: "✖", word: "ПРОВАЛ", tone: "failed" });
    expect(verdictView("UNKNOWN", "bg")).toEqual({ sign: "?", word: "НЕПРОВЕРЕНО", tone: "unknown" });
    expect(verdictView(null, "bg")).toEqual({ sign: "…", word: "РАБОТИ", tone: "working" });
    expect(verdictView(null)).toEqual({ sign: "…", word: "WORKING", tone: "working" });
  });
  it("тестове „A 20/20 · B 19/20 (20 → 19)“", () => {
    expect(testsLine({ a: { passed: 20, total: 20 }, b: { passed: 19, total: 20 }, inventory: { before: 20, after: 19 } })).toBe("A 20/20 · B 19/20 (20 → 19)");
    expect(testsLine({ a: { passed: 20, total: 20 }, b: { passed: 20, total: 20 }, inventory: { before: 20, after: 20 } })).toBe("A 20/20 · B 20/20");
    expect(testsLine({ a: null, b: null, inventory: null })).toBe("tests: no data");
    expect(testsLine({ a: null, b: null, inventory: null }, "bg")).toBe("тестове: няма данни");
    expect(testsOf({ a_passed: 20, a_total: 20, inv_before: 20, inv_after: 19 })).toBe("A 20/20 · B 19/20 (20 → 19)");
    expect(testsOf({ a_passed: 20, a_total: 20, inv_before: 20, inv_after: 21 })).toBe("A 20/20 · B 20/20 (20 → 21)");
    expect(testsOf({ a_passed: null, a_total: null, inv_before: null, inv_after: null }, "bg")).toBe("тестове: няма данни");
  });
  it("един основен бутон според състоянието", () => {
    expect(primaryAction({ state: "GATED", result: "VERIFIED", approval_needed: true, pr_number: 7 })).toBe("approve");
    expect(primaryAction({ state: "HELD", result: "UNKNOWN", approval_needed: false, pr_number: null })).toBe("approve");
    expect(primaryAction({ state: "BLOCKED", result: "FAILED", approval_needed: false, pr_number: null })).toBe("retry");
    expect(primaryAction({ state: "DELIVERED", result: "VERIFIED", approval_needed: false, pr_number: 9 })).toBe("open_pr");
    expect(primaryAction({ state: "RUNNING", result: null, approval_needed: false, pr_number: null })).toBe("view");
  });
  it("слой на ПРОВАЛ (т. 2.2 №10) и човешки текст на причината", () => {
    expect(failureLayer(["D1:regression:a > b"])).toBe("verification");
    expect(failureLayer(["D2:missing_test:tests/cart.spec.ts > cart > x"])).toBe("agent");
    expect(failureLayer(["INFRA:timeout"])).toBe("infra");
    expect(failureLayer(["POLICY:missing"])).toBe("policy");
    expect(failureLayer([])).toBeNull();
    expect(reasonText("D2:missing_test:tests/cart.spec.ts > cart > x", "bg")).toBe("Тестът «tests/cart.spec.ts > cart > x» съществува на base и липсва след промяната. Изтрит тест не може да мине.");
    expect(reasonText("D2:missing_test:tests/cart.spec.ts > cart > x")).toMatch(/^Test «tests\/cart\.spec\.ts > cart > x» exists on base and is missing after the change\./);
    expect(reasonText("D2:missing_test:a <b> & </untrusted>")).not.toContain("<untrusted");
  });
});
