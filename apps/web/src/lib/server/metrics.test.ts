import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jcs, sha256Tag } from "@mandat/contract";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { metricTasks, twinScoreOf } from "./metrics";
import { U, webDb } from "./web-db.test-helper";

// Round 2: what the metrics page reads (as the person, by RLS). A finished task: delivered (accepted), rejected, stopped
// or failed; a person's decision counts, Mandat's own retries and the twin's approvals do not.
let db: Awaited<ReturnType<typeof webDb>>;
beforeEach(async () => (db = await webDb()));
afterEach(async () => db.end());

const task = async (id: string, state: string, wait: string | null, usd = 0.1) => {
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, 'bugfix', 'claude', 'x', 'GATED')", [id, DEMO_ORG_ID, DEMO_REPO_ID]);
  await db.query("update public.tasks set state = $2, wait_reason = $3, usd = $4, state_entered_at = now() - interval '1 day' where id = $1", [id, state, wait, usd]);
};
const ledger = (kind: string, task: string, payload: Record<string, unknown>) => {
  const text = jcs(payload);
  return db.query("select private.ledger_append($1::uuid, $2, $3, $4, $5)", [DEMO_ORG_ID, kind, task, text, sha256Tag(text)]);
};
const approval = async (task: string, method: string) => {
  const cs = await db.query<{ id: string }>("insert into public.changesets (org_id, task_id, attempt, base_sha, head_sha) values ($1, $2, 1, $3, $4) returning id::text as id", [DEMO_ORG_ID, task, "a".repeat(40), "b".repeat(40)]);
  await db.query("insert into public.approvals (org_id, changeset_id, user_id, decision, method, client) values ($1, $2::uuid, $3, 'approved', $4, $5)", [DEMO_ORG_ID, cs.rows[0]?.id, U.owner, method, method === "twin" ? "twin" : "web"]);
};

describe("metricTasks (round 2)", () => {
  it("reads the outcome, the person's decisions, the twin and Mandat's own retries of each finished task", async () => {
    await task("t_m_alone", "CLOSED", null, 0.2);
    await ledger("delivered", "t_m_alone", { pr: 0 });
    await task("t_m_you", "CLOSED", null);
    await ledger("delivered", "t_m_you", { pr: 0 });
    await approval("t_m_you", "tap");
    await ledger("task_retry", "t_m_you", { attempt: 2, by: U.owner });
    await task("t_m_twin", "CLOSED", null);
    await ledger("delivered", "t_m_twin", { pr: 0 });
    await approval("t_m_twin", "twin");
    await ledger("task_retry", "t_m_twin", { attempt: 2, by: "mandat", reason: "auto" });
    await db.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1, 't_m_twin', 'self', 'again')", [DEMO_ORG_ID]);
    await task("t_m_rej", "CLOSED", "rejected");
    await task("t_m_stop", "BLOCKED", "stopped");
    await task("t_m_fail", "BLOCKED", "failed");
    await task("t_m_wait", "HELD", "approval");
    const rows = Object.fromEntries((await metricTasks(db, U.viewer, DEMO_ORG_ID, 30)).filter((r) => r.id.startsWith("t_m_")).map((r) => [r.id, r]));
    expect(Object.keys(rows).sort()).toEqual(["t_m_alone", "t_m_fail", "t_m_rej", "t_m_stop", "t_m_twin", "t_m_you"]);
    expect(rows.t_m_alone).toMatchObject({ outcome: "accepted", human: 0, by_twin: false, usd: 0.2 });
    expect(rows.t_m_you).toMatchObject({ outcome: "accepted", human: 2 });
    expect(rows.t_m_twin).toMatchObject({ outcome: "accepted", human: 0, by_twin: true, self_retries: 1 });
    expect(rows.t_m_rej?.outcome).toBe("rejected");
    expect(rows.t_m_stop?.outcome).toBe("stopped");
    expect(rows.t_m_fail?.outcome).toBe("failed");
  });

  it("the twin's score counts its scored shadow predictions only", async () => {
    await task("t_m_p1", "CLOSED", null);
    await task("t_m_p2", "CLOSED", null);
    await task("t_m_p3", "CLOSED", null);
    const k = `${DEMO_REPO_ID}|bugfix|claude|approval`;
    for (const [id, predicted, actual, by] of [["t_m_p1", "approved", "approved", false], ["t_m_p2", "approved", "rejected", false], ["t_m_p3", "abstain", "approved", false]] as const) {
      await db.query("insert into public.twin_predictions (org_id, task_id, attempt, class_key, predicted, p, n, actual, by_twin) values ($1, $2, 1, $3, $4, 0.9, 5, $5, $6)", [DEMO_ORG_ID, id, k, predicted, actual, by]);
    }
    expect(await twinScoreOf(db, U.viewer, DEMO_ORG_ID)).toEqual({ scored: 2, correct: 1 });
  });
});
