import { describe, expect, it } from "vitest";
import { JOB_TEXT_MAX, JobApproveBody, LedgerKind, PlanProposal, jobBranch, parseHandoff, plannerUser, unitRetryNote, unitTaskText } from "./index.js";
import type { Spec } from "./index.js";

// D-535: the job's shared pieces — the planner's answer, the handoff line, a unit's task text and its retry note.
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

describe("job contracts (D-535)", () => {
  it("the planner's answer is units with ids, titles, criteria and dependencies; nothing else", () => {
    expect(PlanProposal.safeParse({ units: [{ id: "u1", title: "t", criteria: ["AC-1"], depends_on: [] }] }).success).toBe(true);
    expect(PlanProposal.safeParse({ units: [{ id: "u1", title: "t", criteria: ["AC-1"], depends_on: [], status: "passed" }] }).success).toBe(false);
    expect(PlanProposal.safeParse({ units: [{ id: "U 1", title: "t", criteria: [], depends_on: [] }] }).success).toBe(false);
    expect(plannerUser(spec, [{ kind: "uncovered_criterion", id: "AC-2" }])).toContain("uncovered_criterion: AC-2");
  });
  it("the handoff is the last valid HANDOFF line of the notes, for this unit; junk lines are skipped", () => {
    const notes = ["MEMORY: x", 'HANDOFF: {"done":"first"}', "HANDOFF: not json", 'HANDOFF: {"done":"the 10% rule","risks":["rounding"]}', 'HANDOFF: {"done":""}'].join("\n");
    expect(parseHandoff(notes, "u1")).toEqual({ unit_id: "u1", done: "the 10% rule", deviations: [], risks: ["rounding"] });
    expect(parseHandoff("nothing here", "u1")).toBeNull();
    expect(parseHandoff('HANDOFF: {"done":"x","unit_id":"other"}', "u2")?.unit_id).toBe("u2");
  });
  it("a unit's text has the unit's criteria, what stays, earlier handoffs and the handoff hint; it fits a task", () => {
    const t = unitTaskText(spec, { id: "u2", title: "coupon", criteria: ["AC-2"] }, [{ unit_id: "u1", done: "10% rule", deviations: [], risks: [] }]);
    expect(t).toContain("AC-2: WHEN a coupon is given");
    expect(t).toContain("[u1] done: 10% rule");
    expect(t).toContain("Keep unchanged: no discount under 50");
    expect(t).toContain("HANDOFF:");
    // D-538: the handoff is the last step, after the checks ran (writers reported "tests not run" before running them)
    expect(t).toContain("Run the project's tests first");
    expect(t.indexOf("Run the project's tests first")).toBeLessThan(t.indexOf("HANDOFF:"));
    expect(t.indexOf("AC-2")).toBeLessThan(t.indexOf("AC-1"));
    const long = unitTaskText({ ...spec, goal: "g".repeat(600) }, { id: "u1", title: "t", criteria: ["AC-1"] }, Array.from({ length: 30 }, (_, n) => ({ unit_id: `u${n}`, done: "d".repeat(1500), deviations: [], risks: [] })));
    expect(long.length).toBeLessThanOrEqual(JOB_TEXT_MAX);
  });
  it("a retry note carries criterion ids only", () => {
    expect(unitRetryNote(2, ["AC-1", "AC-3"])).toContain("AC-1, AC-3");
    expect(unitRetryNote(2, [])).toContain("attempt 2");
  });
  it("branch, approve body and the new ledger kinds", () => {
    expect(jobBranch("j_abc")).toBe("mandat/job-abc");
    expect(JobApproveBody.safeParse({ seal_hash: `sha256:${"a".repeat(64)}` }).success).toBe(true);
    for (const k of ["plan_built", "session_sealed", "job_approved"]) expect(LedgerKind.parse(k)).toBe(k);
  });
});
