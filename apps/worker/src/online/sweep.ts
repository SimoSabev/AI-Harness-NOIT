import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import { enqueueOutbox } from "./pg-outbox.js";
import { MAX_TASK_MINUTES, WORKING_STATES, deadlineFor, isWorkingState, sweepDecision } from "./lease.js";

// D-451 (T3-8, D-211): the sweeper the worker runs on every pass. A working task is overdue when its deadline
// (state_deadline_at, else state_entered_at + the state's maximum) has passed. Alive (this worker processes it) → a new
// deadline; dead → BLOCKED (runner_offline, or infra:lease_lost in verify) with task_stopped and a web_push.
export interface SweepResult { task_id: string; kind: "extend" | "blocked" }

const STATES = `(${WORKING_STATES.map((s) => `'${s}'`).join(", ")})`;

export async function sweepOverdue(db: SqlClient, o: { now: Date; env: Record<string, string | undefined>; alive: (taskId: string) => boolean }): Promise<SweepResult[]> {
  const rows = (await db.query<{ id: string; org_id: string; attempt: number; state: string; entered: string; deadline: string | null; has_verdict: boolean }>(
    `select t.id, t.org_id::text as org_id, t.attempt, t.state, t.state_entered_at::text as entered, t.state_deadline_at::text as deadline,
            exists (select 1 from public.verdicts v where v.task_id = t.id and v.attempt = t.attempt) as has_verdict
       from public.tasks t where t.state in ${STATES} order by t.id`,
  )).rows;
  const out: SweepResult[] = [];
  for (const t of rows) {
    if (!isWorkingState(t.state)) continue;
    const due = t.deadline ? new Date(t.deadline) : deadlineFor(t.state, new Date(t.entered), o.env, MAX_TASK_MINUTES);
    if (due > o.now) continue;
    const a = sweepDecision({ task_id: t.id, attempt: t.attempt, state: t.state, step: null, alive: o.alive(t.id), hasVerdict: t.has_verdict });
    if (a.kind === "extend") {
      await db.query("update public.tasks set state_deadline_at = $2::timestamptz where id = $1 and state = $3", [t.id, deadlineFor(t.state, o.now, o.env, MAX_TASK_MINUTES).toISOString(), t.state]);
      out.push({ task_id: t.id, kind: "extend" });
      continue;
    }
    if (a.kind === "none") continue; // a verdict exists: the attempt's ending is someone else's step, never a second verdict
    // the UNKNOWN verdict of the spec needs a sealed verdict the sweeper cannot build; BLOCKED with the reason (D-451)
    const reason = a.reason;
    const r = await db.query<{ id: string }>(
      "update public.tasks set state = 'BLOCKED', wait_reason = $3, state_entered_at = now(), state_deadline_at = null, updated_at = now(), seq = seq + 1 where id = $1 and state = $2 returning id",
      [t.id, t.state, reason],
    );
    if (r.rows.length === 0) continue; // it moved on in the meantime
    await appendLedgerOnline(db, { org_id: t.org_id, kind: "task_stopped", task_id: t.id, payload: { reason, state: t.state } });
    await enqueueOutbox(db, { org_id: t.org_id, kind: "web_push", idempotency_key: `push:${t.id}:${t.attempt}:${reason}`, payload: { task_id: t.id, kind: "failed" } });
    out.push({ task_id: t.id, kind: "blocked" });
  }
  return out;
}
