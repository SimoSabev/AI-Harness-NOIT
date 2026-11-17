import { describe, expect, it } from "vitest";
import { AXIS_NAMES, OracleKind, ProofKind, TaskAxes, TaskProfile, TaskProfileId } from "./index.js";

// Х0 (D-532, docs/prd/heavy-process.md §0): a task is understood on six axes; each may still be "unknown".
const known = {
  code: "existing",
  reference: "none",
  divisible: "no",
  proof: ["tests"],
  risk: { level: "low", outward: false },
  size: "m",
} as const;
const allUnknown = { code: "unknown", reference: "unknown", divisible: "unknown", proof: "unknown", risk: "unknown", size: "unknown" } as const;

describe("task axes (D-532)", () => {
  it("six axes, every one accepts unknown", () => {
    expect([...AXIS_NAMES]).toEqual(["code", "reference", "divisible", "proof", "risk", "size"]);
    expect(TaskAxes.parse(allUnknown)).toEqual(allUnknown);
    expect(TaskAxes.parse(known)).toEqual(known);
  });
  it("a reference is none or a kind with a locator", () => {
    const ref = { kind: "old_system", locator: "https://legacy.example/app" };
    expect(TaskAxes.parse({ ...known, reference: ref }).reference).toEqual(ref);
    expect(TaskAxes.safeParse({ ...known, reference: { kind: "vibes", locator: "x" } }).success).toBe(false);
    expect(TaskAxes.safeParse({ ...known, reference: { kind: "standard", locator: "  " } }).success).toBe(false);
  });
  it("rejects unknown values, extra keys, an empty or repeated proof list", () => {
    expect(TaskAxes.safeParse({ ...known, size: "xxl" }).success).toBe(false);
    expect(TaskAxes.safeParse({ ...known, team: "big" }).success).toBe(false);
    expect(TaskAxes.safeParse({ ...known, proof: [] }).success).toBe(false);
    expect(TaskAxes.safeParse({ ...known, proof: ["tests", "tests"] }).success).toBe(false);
    expect(TaskAxes.safeParse({ ...known, risk: { level: "low" } }).success).toBe(false);
  });
  it("the proof and oracle kinds are the agreed lists", () => {
    expect(ProofKind.options).toEqual(["tests", "ui", "differential", "numbers", "human"]);
    expect(OracleKind.options).toEqual(["hidden_tests", "differential", "e2e", "mutation_graded", "exploit", "citations", "human_review"]);
  });
});

describe("task profile (D-532)", () => {
  const profile = {
    id: "feature",
    name: "Feature",
    axes: known,
    plan: { oracle: ["hidden_tests", "mutation_graded"], unit: "criterion", parallel: "single", pilot: false },
  };
  it("ten profile ids, other included", () => {
    expect(TaskProfileId.options).toEqual(["new_product", "feature", "migration", "refactor", "upgrade", "hardening", "tests", "infra", "research", "other"]);
  });
  it("round-trips and rejects a bad plan", () => {
    expect(TaskProfile.parse(profile)).toEqual(profile);
    expect(TaskProfile.safeParse({ ...profile, plan: { ...profile.plan, parallel: "swarm" } }).success).toBe(false);
    expect(TaskProfile.safeParse({ ...profile, plan: { ...profile.plan, oracle: ["vibes"] } }).success).toBe(false);
    expect(TaskProfile.safeParse({ ...profile, plan: { ...profile.plan, oracle: ["e2e", "e2e"] } }).success).toBe(false);
    expect(TaskProfile.safeParse({ ...profile, id: "chat" }).success).toBe(false);
  });
});
