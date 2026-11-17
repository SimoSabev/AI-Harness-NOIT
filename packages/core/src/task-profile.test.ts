import { describe, expect, it } from "vitest";
import { TaskAxes, TaskProfile } from "@mandat/contract";
import type { TaskProfileId } from "@mandat/contract";
import { PROFILE_NAMES, PROFILE_UNITS, deriveProfile, unknownAxes } from "./index.js";

// Х0 (D-532, docs/prd/heavy-process.md §0): axes → a known profile when it clearly matches, else "other"; the plan
// always comes from the axes.
const base = TaskAxes.parse({ code: "existing", reference: "none", divisible: "no", proof: ["tests"], risk: { level: "low", outward: false }, size: "m" });
const ax = (over: Partial<Record<keyof TaskAxes, unknown>>): TaskAxes => TaskAxes.parse({ ...base, ...over });
const allUnknown = TaskAxes.parse({ code: "unknown", reference: "unknown", divisible: "unknown", proof: "unknown", risk: "unknown", size: "unknown" });
const oldSystem = { kind: "old_system", locator: "https://legacy.example" };

describe("deriveProfile: which profile (D-532)", () => {
  const cases: [string, TaskAxes, TaskProfileId][] = [
    ["no code, big, tests → new product", ax({ code: "none", size: "l", proof: ["tests", "ui"] }), "new_product"],
    ["existing code, tests, no reference → feature", base, "feature"],
    ["an old system to match → migration", ax({ reference: oldSystem, proof: ["differential"] }), "migration"],
    ["a reference implementation → migration", ax({ code: "none", reference: { kind: "reference_impl", locator: "repo:x" } }), "migration"],
    ["existing code, same behaviour proven by differential → refactor", ax({ proof: ["tests", "differential"] }), "refactor"],
    ["existing code, a standard, high risk → hardening", ax({ reference: { kind: "standard", locator: "OWASP ASVS 5" }, risk: { level: "high", outward: false } }), "hardening"],
    ["no code, proof only numbers/human → research", ax({ code: "none", proof: ["numbers", "human"], size: "s" }), "research"],
    ["no code, small, tests → other (not clearly a product)", ax({ code: "none", size: "s" }), "other"],
    ["a standard with low risk → other", ax({ reference: { kind: "standard", locator: "RFC 9110" } }), "other"],
    ["all unknown → other", allUnknown, "other"],
    ["code unknown → other", ax({ code: "unknown" }), "other"],
  ];
  it.each(cases)("%s", (_name, axes, id) => {
    const p = deriveProfile(axes);
    expect(p.id).toBe(id);
    expect(p.name).toBe(PROFILE_NAMES[id]);
    expect(p.plan.unit).toBe(PROFILE_UNITS[id]);
    expect(TaskProfile.parse(p)).toEqual(p);
  });
  it("upgrade, tests and infra come only from a hint that the axes do not contradict", () => {
    expect(deriveProfile(base, "upgrade").id).toBe("upgrade");
    expect(deriveProfile(base, "tests").id).toBe("tests");
    expect(deriveProfile(ax({ code: "none" }), "infra").id).toBe("infra");
    expect(deriveProfile(ax({ code: "none" }), "upgrade").id).toBe("other");
    expect(deriveProfile(base, "migration").id).toBe("feature");
    expect(deriveProfile(ax({ code: "none", proof: ["tests"] }), "research").id).toBe("other");
    expect(deriveProfile(allUnknown, "upgrade").id).toBe("upgrade");
  });
});

describe("deriveProfile: the plan from the axes (D-532)", () => {
  it("code work always has hidden tests graded by mutations; nothing else for a plain feature", () => {
    expect(deriveProfile(base).plan).toEqual({ oracle: ["hidden_tests", "mutation_graded"], unit: "criterion", parallel: "single", pilot: false });
  });
  it("a reference or a differential proof → differential", () => {
    expect(deriveProfile(ax({ reference: oldSystem })).plan.oracle).toContain("differential");
    expect(deriveProfile(ax({ proof: ["differential"] })).plan.oracle).toContain("differential");
  });
  it("proof ui → e2e; proof human → human_review", () => {
    expect(deriveProfile(ax({ proof: ["ui"] })).plan.oracle).toEqual(["hidden_tests", "e2e", "mutation_graded"]);
    expect(deriveProfile(ax({ proof: ["tests", "human"] })).plan.oracle).toContain("human_review");
  });
  it("high risk or an outward action → exploit and human_review", () => {
    for (const risk of [{ level: "high", outward: false }, { level: "low", outward: true }]) {
      expect(deriveProfile(ax({ risk })).plan.oracle).toEqual(["hidden_tests", "mutation_graded", "exploit", "human_review"]);
    }
    expect(deriveProfile(ax({ risk: { level: "medium", outward: false } })).plan.oracle).not.toContain("exploit");
  });
  it("divisible yes → waves; size l/xl → pilot", () => {
    expect(deriveProfile(ax({ divisible: "yes" })).plan.parallel).toBe("waves");
    expect(deriveProfile(ax({ divisible: "unknown" })).plan.parallel).toBe("single");
    expect(deriveProfile(ax({ size: "l" })).plan.pilot).toBe(true);
    expect(deriveProfile(ax({ size: "xl" })).plan.pilot).toBe(true);
    expect(deriveProfile(ax({ size: "s" })).plan.pilot).toBe(false);
  });
  it("research is not code work: citations instead of hidden tests", () => {
    expect(deriveProfile(ax({ code: "none", proof: ["numbers"], size: "s" })).plan.oracle).toEqual(["citations"]);
  });
  it("all unknown: still a valid plan with hidden tests (the interview is not over)", () => {
    expect(deriveProfile(allUnknown).plan).toEqual({ oracle: ["hidden_tests", "mutation_graded"], unit: "unit", parallel: "single", pilot: false });
  });
  it("keeps the axes it was given", () => {
    expect(deriveProfile(base).axes).toEqual(base);
  });
});

describe("unknownAxes (D-532)", () => {
  it("lists the axes still unknown, in axis order; the interview ends when it is empty", () => {
    expect(unknownAxes(allUnknown)).toEqual(["code", "reference", "divisible", "proof", "risk", "size"]);
    expect(unknownAxes(ax({ proof: "unknown", size: "unknown" }))).toEqual(["proof", "size"]);
    expect(unknownAxes(base)).toEqual([]);
  });
});
