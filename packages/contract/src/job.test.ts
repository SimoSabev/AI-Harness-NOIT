import { describe, expect, it } from "vitest";
import { ADVISOR_SYSTEM, withFiles, PLAYBOOK_SYSTEM, playbookUser, withPlaybook, JOB_PARALLEL_MAX, RESCUE_MAX, RESCUE_TRIES, UnitStatus, advisorUser, rescueTaskText, JOB_TEXT_MAX, JobApproveBody, LedgerKind, PLANNER_SYSTEM, PlanProposal, RELAND_MAX, jobBranch, parseHandoff, plannerSystem, plannerUser, unitRetryNote, unitTaskText } from "./index.js";
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
    // D-594: a shared new module says how to fix it
    const shared = plannerUser(spec, [{ kind: "shared_new_module", id: "u1+u3:src/giftcards/store" }]);
    expect(shared).toContain("shared_new_module: u1+u3:src/giftcards/store");
    expect(shared).toMatch(/run side by side[\s\S]*depend/);
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
    // D-571: a rescue try gets the oracle's API too, and the advice still fits beside it
    const api = Array.from({ length: 9 }, (_, k) => `\`src/m${k}.ts\`: \`f${k}(x: number): number\` — ${"a rule about it ".repeat(14)}`);
    const c = rescueTaskText("y".repeat(3900), "Round half up.", 0, api);
    expect(c.length).toBeLessThanOrEqual(JOB_TEXT_MAX);
    expect(c).toContain("Public API the hidden checks use");
    expect(c).toContain("f0(x: number)");
    expect(c).toContain("Round half up.");
    expect(UnitStatus.parse("parked")).toBe("parked");
  });
});

describe("the unit points to the job's map (D-543)", () => {
  it("names the read-only folder", () => {
    expect(unitTaskText(spec, { id: "u1", title: "t", criteria: ["AC-1"] }, [])).toContain("/m/in/job (read only)");
  });
});

describe("the pilot's playbook (D-545)", () => {
  it("the tuner reads the pilot's handoffs and counts, never a test; the playbook goes into later units' text, framed", () => {
    expect(PLAYBOOK_SYSTEM).toContain("pilot");
    const q = playbookUser(spec, [{ unit_id: "u1", done: "moved the module", deviations: ["kept the old export"], risks: ["dates"] }], { units: 3, rescues: 1, relands: 0 });
    expect(q).toContain("Goal: Discounts");
    expect(q).toContain("u1: moved the module; deviations: kept the old export; risks: dates");
    expect(q).toContain("3 pilot units, 1 rescued, 0 built again");
    const base = unitTaskText(spec, { id: "u4", title: "t", criteria: ["AC-1"] }, []);
    const t = withPlaybook(base, "Keep the old export.");
    expect(t).toContain("Playbook from the pilot");
    expect(t).toContain("Keep the old export.");
    expect(withPlaybook(base, null)).toBe(base);
    expect(withPlaybook(base, "x".repeat(9000)).length).toBeLessThanOrEqual(JOB_TEXT_MAX);
  });
});

describe("migration sites in the plan (D-546)", () => {
  it("a migration's planner is asked for sites, files and skip; others are not", () => {
    expect(plannerSystem("single", { migration: true })).toContain('"sites"');
    expect(plannerSystem("waves", { migration: true })).toContain("Every found file must be in exactly one unit or in skip");
    expect(plannerSystem("single")).not.toContain('"sites"');
  });
  it("the proposal takes sites, unit files and skip; paths stay inside the project", () => {
    const ok = PlanProposal.safeParse({ units: [{ id: "u1", title: "t", criteria: ["AC-1"], depends_on: [], files: ["src/a.ts"] }], sites: { match: "require[(]" }, skip: [{ file: "src/b.ts", why: "done" }] });
    expect(ok.success).toBe(true);
    for (const bad of ["../x.ts", "/etc/passwd", "a/../../b"]) expect(PlanProposal.safeParse({ units: [{ id: "u1", title: "t", criteria: [], depends_on: [], files: [bad] }] }).success).toBe(false);
    expect(PlanProposal.safeParse({ units: [], skip: [{ file: "a.ts", why: "later" }] }).success).toBe(false);
    expect(withFiles("text", ["src/a.ts", "src/b.ts"])).toBe("text\nFiles of this unit: src/a.ts, src/b.ts");
    expect(withFiles("text", [])).toBe("text");
  });
});
