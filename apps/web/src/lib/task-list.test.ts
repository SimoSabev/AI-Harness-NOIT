import { describe, expect, it } from "vitest";
import { foldJobs, mergeByTime, openConversationsToList } from "./task-list";
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

