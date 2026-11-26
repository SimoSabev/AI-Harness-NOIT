import { describe, expect, it } from "vitest";
import { byProject, foldJobs, mergeByTime, openConversationsToList, sessionsOf } from "./task-list";
import type { OpenConversation } from "./task-list";

// D-554 (screens 19.11.2026): a job's internal tasks (oracle, units, final check) crowded the task list, one row each;
// they fold into one row for their conversation, placed where the newest of them is.
const row = (id: string, at: string, o: { role?: "oracle" | "unit" | "final"; conv?: string | null; merged?: boolean } = {}) =>
  ({ id, updated_at: at, internal_role: o.role ?? null, conversation_id: o.conv ?? null, job_merged: o.merged ?? false });

describe("folding a job's internal tasks into one row (screens 19.11.2026, D-554)", () => {
  it("keeps plain tasks as they are, in order", () => {
    const r = foldJobs([row("t_a", "3"), row("t_b", "2")]);
    expect(r).toEqual([{ kind: "task", row: row("t_a", "3") }, { kind: "task", row: row("t_b", "2") }]);
  });

  it("folds the oracle, units and final check of one conversation into one job row at its newest place", () => {
    const rows = [row("t_fin", "9", { role: "final", conv: "c_1" }), row("t_plain", "8"), row("t_u2", "7", { role: "unit", conv: "c_1" }), row("t_or", "1", { role: "oracle", conv: "c_1" })];
    const r = foldJobs(rows);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ kind: "job", conversation_id: "c_1", newest: rows[0], count: 3, merged: false });
    expect(r[1]).toEqual({ kind: "task", row: rows[1] });
  });

  it("keeps two jobs apart", () => {
    const r = foldJobs([row("t_1", "4", { role: "unit", conv: "c_1" }), row("t_2", "3", { role: "unit", conv: "c_2" }), row("t_3", "2", { role: "oracle", conv: "c_1" })]);
    expect(r.map((x) => (x.kind === "job" ? `${x.conversation_id}:${x.count}` : x.row.id))).toEqual(["c_1:2", "c_2:1"]);
  });

  it("an internal task whose conversation is unknown stays its own row", () => {
    const lost = row("t_u", "5", { role: "unit", conv: null });
    expect(foldJobs([lost])).toEqual([{ kind: "task", row: lost }]);
  });

  // a verified job merged into the project's main read "Closed" like any closed task (screens 19.11.2026)
  it("knows the job is merged when its job has a merge commit", () => {
    const r = foldJobs([row("t_fin", "9", { role: "final", conv: "c_1", merged: true }), row("t_or", "1", { role: "oracle", conv: "c_1" })]);
    expect(r).toEqual([expect.objectContaining({ kind: "job", merged: true, count: 2 })]);
  });
});

// D-583 (live 22.11.2026): a conversation of "Ask first" that has not become a task or a job yet was nowhere in the list,
// so after leaving it the person thought it was not saved. It is listed now, by time, until it becomes a task or a job.
const conv = (id: string, at: string, o: Partial<OpenConversation> = {}): OpenConversation => ({ id, text: "Research universities", purpose: "task", status: "idle", phase: "conversation", updated_at: at, job_id: null, task_id: null, ...o });

describe("open conversations in the task list (D-583)", () => {
  it("lists the conversations that are neither a task nor a job yet, newest first", () => {
    const r = openConversationsToList([conv("c_1", "1"), conv("c_2", "3"), conv("c_job", "5", { job_id: "j_1" }), conv("c_task", "4", { task_id: "t_1" })], new Set());
    expect(r.map((c) => c.id)).toEqual(["c_2", "c_1"]);
  });

  it("a conversation already shown as a job row is not listed twice", () => {
    expect(openConversationsToList([conv("c_1", "1")], new Set(["c_1"]))).toEqual([]);
  });

  it("merges two lists newest first (ISO times)", () => {
    const a = [{ at: "2026-11-22T14:00:00Z", id: "t_a" }, { at: "2026-11-22T10:00:00Z", id: "t_b" }];
    const b = [{ at: "2026-11-22T12:00:00Z", id: "c_1" }];
    expect(mergeByTime(a, b).map((x) => x.id)).toEqual(["t_a", "c_1", "t_b"]);
  });
});


// D-633 (Simo 26.11.2026): the list is by project only, each folds; a conversation is a session and the tasks it made
// (the oracle, the units, the final check, the single-agent comparison, a task it started) are its sub-sessions.
describe("sessions and sub-sessions (D-633)", () => {
  const r = (id: string, at: string, conv: string | null, repo: string | null = "p1") => ({ id, updated_at: at, conversation_id: conv, repo_id: repo });
  it("every task of one conversation is one session at the place of its newest; a task without one is its own", () => {
    const rows = [r("t_u2", "2026-11-26T10:05:00Z", "c1"), r("t_alone", "2026-11-26T10:04:00Z", null), r("t_cmp", "2026-11-26T10:03:00Z", "c1"), r("t_o", "2026-11-26T09:00:00Z", "c1"), r("t_x", "2026-11-25T09:00:00Z", "c2")];
    const s = sessionsOf(rows);
    expect(s.map((x) => (x.kind === "conv" ? [x.conversation_id, x.rows.map((y) => y.id)] : [x.row.id]))).toEqual([
      ["c1", ["t_u2", "t_cmp", "t_o"]],
      ["t_alone"],
      ["c2", ["t_x"]],
    ]);
  });
});

describe("the list by project (D-633)", () => {
  const w = (id: string, project: string | null, projectName: string) => ({ id, project, projectName });
  it("one group per project in the order of its newest session; the sessions keep their order; no project last", () => {
    const rows = [w("a", "p2", "local/shop"), w("b", null, ""), w("c", "p1", "local/bakery"), w("d", "p2", "local/shop")];
    expect(byProject(rows).map((g) => [g.id, g.name, g.items.map((x) => x.id)])).toEqual([
      ["p2", "local/shop", ["a", "d"]],
      ["p1", "local/bakery", ["c"]],
      [null, "", ["b"]],
    ]);
    expect(byProject([])).toEqual([]);
  });
});
