import { describe, expect, it } from "vitest";
import { ADVISOR_SYSTEM, JOB_PARALLEL_MAX, RESCUE_MAX, RESCUE_TRIES, UnitStatus, advisorUser, rescueTaskText, JOB_TEXT_MAX, JobApproveBody, LedgerKind, PLANNER_SYSTEM, PlanProposal, RELAND_MAX, jobBranch, parseHandoff, plannerSystem, plannerUser, unitRetryNote, unitTaskText } from "./index.js";
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
    // D-540: the handoff is the last step, after the checks ran (writers reported "tests not run" before running them)
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

describe("the planner in waves (D-541)", () => {
  it("single keeps the М1 instruction; waves tells the planner that units without a dependency run at the same time", () => {
    expect(plannerSystem("single")).toBe(PLANNER_SYSTEM);
    const w = plannerSystem("waves");
    expect(w).toContain("at the same time");
    expect(w).toContain("separate copies");
    expect(w).toContain("only when");
    expect(w).not.toContain("each one builds on the previous");
    expect(JOB_PARALLEL_MAX).toBeGreaterThan(1);
    expect(RELAND_MAX).toBeGreaterThanOrEqual(1);
    expect(LedgerKind.parse("unit_relanded")).toBe("unit_relanded");
  });
});

describe("a unit that stopped gets advice and two fresh tries (D-542)", () => {
  const unit = { id: "u1", title: "the 10% rule", criteria: ["AC-1"] };
  it("the advisor sees the unit, its criteria and the failing ids, never a test; asks for short concrete advice", () => {
    expect(ADVISOR_SYSTEM).toContain("cannot see");
    const q = advisorUser(spec, unit, ["AC-1"], ["D5:hidden_fail:h00000000"], "HANDOFF said: rounding is hard");
    expect(q).toContain("AC-1: WHEN");
    expect(q).toContain("Failing criteria: AC-1");
    expect(q).toContain("rounding is hard");
    expect(RESCUE_TRIES).toBe(2);
    expect(RESCUE_MAX).toBeGreaterThanOrEqual(1);
  });
  it("each try gets the advice framed as advice; the second try is told to take another way; the text stays in bounds", () => {
    const base = unitTaskText(spec, unit, []);
    const a = rescueTaskText(base, "Round half up.", 0);
    const b = rescueTaskText(base, "Round half up.", 1);
    expect(a).toContain("Advice from a reviewer");
    expect(a).toContain("Round half up.");
    expect(a).not.toContain("different approach");
    expect(b).toContain("different approach");
    expect(rescueTaskText(base, "x".repeat(9000), 1).length).toBeLessThanOrEqual(JOB_TEXT_MAX);
    expect(UnitStatus.parse("parked")).toBe("parked");
  });
});
