import { describe, expect, it } from "vitest";
import { pathOf } from "./task-path";
import type { ConversationFeed, ConversationRow, JobView, OracleView } from "./conversation-types";

// D-599: the path of a task (the strap of the brand kit): Разговор → Спецификация → Оракул → Работа → Печат. Each stop
// is done, running (the agents), waiting on you, failed or not reached; at most one stop waits on you.
const conv = (o: Partial<ConversationRow> = {}): ConversationRow => ({
  id: "c", agent: "claude", model: null, phase: "conversation", status: "idle", usd: 0, budget_usd: 1, error: null, task_id: null, repo: "local/x",
  profile: null, unknown_axes: null, spec_hash: null, spec_ready: false, approved_spec_hash: null, purpose: "task", project_approved: false, ...o,
} as ConversationRow);
const oracle = (o: Partial<OracleView> = {}): OracleView => ({ id: "o", status: "building", spec_hash: "h", oracle_hash: null, problems: [], red_on_base: [], tests: 0, ...o });
const job = (o: Partial<JobView> = {}): JobView => ({
  id: "j", status: "running", question: null, units: [], current: null, final_task_id: null, seal: null, merged_sha: null,
  strategy: { profile: null, mode: "waves", waves: 2, pilot: null, roles: [], reasons: [] }, gates: [], ...o,
});
const feed = (f: Partial<ConversationFeed> & { conversation?: ConversationRow }): ConversationFeed => ({ conversation: conv(), turns: [], ...f });
const states = (f: ConversationFeed) => pathOf(f).map((s) => s.state);

describe("pathOf (D-599)", () => {
  it("has the five stops in order", () => {
    expect(pathOf(feed({})).map((s) => s.id)).toEqual(["conversation", "spec", "oracle", "work", "seal"]);
  });
  it("a conversation waiting for the person's answer is your move; while the model answers, it runs", () => {
    expect(states(feed({}))).toEqual(["you", "todo", "todo", "todo", "todo"]);
    expect(states(feed({ conversation: conv({ status: "running" }) }))).toEqual(["run", "todo", "todo", "todo", "todo"]);
  });
  it("a proposed spec waits on you; an approved one is done and the oracle is being built", () => {
    expect(states(feed({ conversation: conv({ spec_ready: true, spec_hash: "h" }) }))).toEqual(["done", "you", "todo", "todo", "todo"]);
    expect(states(feed({ conversation: conv({ spec_ready: true, approved_spec_hash: "h" }), oracle_required: true, oracle: oracle() }))).toEqual(["done", "done", "run", "todo", "todo"]);
  });
  it("a ready oracle waits on you; a failed one is failed; without hidden tests the oracle stop is skipped as done", () => {
    const approved = conv({ spec_ready: true, approved_spec_hash: "h" });
    expect(states(feed({ conversation: approved, oracle_required: true, oracle: oracle({ status: "ready", tests: 22 }) }))[2]).toBe("you");
    expect(states(feed({ conversation: approved, oracle_required: true, oracle: oracle({ status: "failed" }) }))[2]).toBe("fail");
    expect(states(feed({ conversation: approved, oracle_required: false }))[2]).toBe("done");
  });
  it("the work runs, waits on you when it asks or is sealed, and the seal is done once merged", () => {
    const base = { conversation: conv({ spec_ready: true, approved_spec_hash: "h" }), oracle_required: true, oracle: oracle({ status: "approved", tests: 22 }) };
    expect(states(feed({ ...base, job: job() }))).toEqual(["done", "done", "done", "run", "todo"]);
    expect(states(feed({ ...base, job: job({ status: "parked", question: "q" }) }))).toEqual(["done", "done", "done", "you", "todo"]);
    expect(states(feed({ ...base, job: job({ status: "converging" }) }))).toEqual(["done", "done", "done", "done", "run"]);
    const seal = { hash: "s", verdict: "VERIFIED" as const, result_ref: "r", checked: [], unchecked: [] };
    expect(states(feed({ ...base, job: job({ status: "sealed", seal }) }))).toEqual(["done", "done", "done", "done", "you"]);
    expect(states(feed({ ...base, job: job({ status: "delivered", seal, merged_sha: "abc" }) }))).toEqual(["done", "done", "done", "done", "done"]);
    expect(states(feed({ ...base, job: job({ status: "failed" }) }))[3]).toBe("fail");
  });
  it("never more than one stop waits on you", () => {
    const f = feed({ conversation: conv({ spec_ready: true, spec_hash: "h" }) });
    expect(states(f).filter((s) => s === "you")).toHaveLength(1);
  });
  it("each stop carries one fact: answers, criteria, hidden tests, units, gates", () => {
    const base = { conversation: conv({ spec_ready: true, approved_spec_hash: "h" }), oracle_required: true, oracle: oracle({ status: "approved", tests: 22 }) };
    const units = [1, 2, 3].map((n) => ({ id: `u${n}`, title: "t", criteria: [], status: n === 1 ? "passed" : "running", result: null, failing: [], task_id: null, wave: 1, pilot: false, copy: null }));
    const p = pathOf(feed({ ...base, job: job({ units }) }));
    expect(p[2].count).toEqual({ n: 22 });
    expect(p[3].count).toEqual({ n: 1, of: 3 });
  });
});
