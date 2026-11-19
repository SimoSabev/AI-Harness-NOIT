import { describe, expect, it } from "vitest";
import { JOB_IN, JobRoles, jobMapFiles, roleRoute } from "./index.js";
import type { Spec } from "./index.js";

// D-543 (М2 Х4): the task harness of a job — a short map and a feature list outside the work tree, read only for the
// writer; Mandat alone sets `passes` from the hidden checks. And a model per role.
const spec: Spec = {
  goal: "Discounts",
  product: "",
  criteria: [
    { id: "AC-1", when: "the subtotal is over 50", shall: "apply 10%", proof: "tests" },
    { id: "AC-2", when: "a coupon is given", shall: "apply it after the 10%", proof: "tests" },
  ],
  unchanged: ["no discount under 50"],
  out_of_scope: ["shipping"],
  profile: "feature",
};
const units = [
  { id: "u1", title: "the 10% rule", criteria: ["AC-1"], status: "passed", depends_on: [] },
  { id: "u2", title: "coupons", criteria: ["AC-2"], status: "running", depends_on: ["u1"] },
];

describe("the job's map and feature list (D-543)", () => {
  const files = jobMapFiles({ spec, mode: "waves", units, current: "u2", handoffs: [{ unit_id: "u1", done: "added the rule", deviations: ["rounded down"], risks: [] }] });
  const map = files.find((f) => f.path === "README.md")?.data ?? "";
  const features = JSON.parse(files.find((f) => f.path === "features.json")?.data ?? "{}") as { features: { id: string; passes: boolean; unit: string[] }[]; note: string };
  it("the map: goal, this unit, the plan with statuses, what stays, the decision log, how to start; short", () => {
    expect(JOB_IN).toBe("/m/in/job");
    expect(map).toContain("Discounts");
    expect(map).toContain("You build unit u2");
    expect(map).toContain("[x] u1 the 10% rule (AC-1)");
    expect(map).toContain("[ ] u2 coupons (AC-2) — running, needs u1");
    expect(map).toContain("no discount under 50");
    expect(map).toContain("u1: added the rule; deviations: rounded down");
    expect(map).toContain("git log");
    expect(map).toContain("Run the project's tests first");
    expect(map.split("\n").length).toBeLessThanOrEqual(120);
  });
  it("the feature list: every criterion with its units; passes only from units that passed; read only", () => {
    expect(features.features).toEqual([
      { id: "AC-1", when: "the subtotal is over 50", shall: "apply 10%", proof: "tests", unit: ["u1"], passes: true },
      { id: "AC-2", when: "a coupon is given", shall: "apply it after the 10%", proof: "tests", unit: ["u2"], passes: false },
    ]);
    expect(features.note).toContain("Mandat sets passes");
  });
  it("a long job stays in bounds", () => {
    const many = Array.from({ length: 40 }, (_, n) => ({ id: `u${n}`, title: "t".repeat(200), criteria: ["AC-1"], status: "pending", depends_on: [] }));
    const hs = Array.from({ length: 40 }, (_, n) => ({ unit_id: `u${n}`, done: "d".repeat(500), deviations: [], risks: [] }));
    const m = jobMapFiles({ spec, mode: "single", units: many, current: "u3", handoffs: hs }).find((f) => f.path === "README.md")?.data ?? "";
    expect(m.length).toBeLessThanOrEqual(16_000);
  });
});

describe("a model per role (D-543)", () => {
  const job = { agent: "claude", model: "sonnet" };
  it("a role without its own choice uses the job's agent and model", () => {
    expect(roleRoute(job, null, "planner")).toEqual({ agent: "claude", model: "sonnet" });
    expect(roleRoute(job, JobRoles.parse({ advisor: { agent: "codex", model: "gpt-x" } }), "advisor")).toEqual({ agent: "codex", model: "gpt-x" });
    expect(roleRoute(job, JobRoles.parse({ advisor: { agent: "codex", model: "gpt-x" } }), "writer")).toEqual(job);
  });
  it("only the known roles, strictly", () => {
    expect(JobRoles.safeParse({ boss: { agent: "x", model: null } }).success).toBe(false);
    expect(JobRoles.safeParse({ writer: { agent: "", model: null } }).success).toBe(false);
  });
});
