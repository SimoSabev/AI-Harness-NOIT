import { failingCriteria, failingTitles, nextMove } from "@mandat/core";
import type { SelfFinishInput } from "@mandat/core";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import type { VerdictResult } from "@mandat/contract";
import { unitRetryNote } from "@mandat/contract";
import { inTransaction } from "./db.js";
import type { Db } from "./db.js";
import { proposalFor, whatStopped } from "./night-rules.js";

// Round 1, feature 1 „Сам довършва“ (D-521): the daytime tick (beside the night tick) that applies core's nextMove to
// HELD and BLOCKED tasks. A retry is a new attempt with Mandat's own note (task_activities kind 'self', read by the
// daemon into the contract like the night note) and a task_retry ledger row by "mandat". The update is guarded by the
// state and the attempt it read, so a person who acted in between wins.
export interface SelfFinishTick { retried: string[]; waiting: string[] }

interface Row {
  id: string; org_id: string; state: string; wait_reason: string | null; last_result: VerdictResult | null; attempt: number; attempts_max: number;
  ci_rounds: number; ci_cap: number | null; held_since: string; night: boolean; auto_retries: number; resets_at: string | null; reasons: unknown;
  /** D-535: a unit of a job (its retry note names the failing criteria) */
  job_id: string | null; failing: unknown;
  /** D-711: the task kind (M4's single arm is 'compare') */
  kind: string | null;
}

const pick = (where: string) => `
  select t.id, t.org_id::text as org_id, t.state, t.wait_reason, t.last_result, t.attempt, t.attempts_max, t.ci_rounds,
         (select (h.layers -> 'g' ->> 'ci_rounds')::int from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = t.repo_id) as ci_cap,
         t.state_entered_at::text as held_since, t.shift_id is not null as night,
         (select count(*)::int from public.task_activities a where a.task_id = t.id and a.kind = 'self') as auto_retries,
         (select l.payload ->> 'resets_at' from public.ledger l where l.task_id = t.id and l.kind = 'channel_limit' order by l.seq desc limit 1) as resets_at,
         (select v.reasons from public.verdicts v where v.task_id = t.id and v.attempt = t.attempt order by v.created_at desc limit 1) as reasons,
         t.job_id, (select u.failing from public.job_units u where u.job_id = t.job_id and u.unit_id = t.unit_id) as failing, t.kind
    from public.tasks t
   where t.state in ('HELD', 'BLOCKED') and ${where}
   order by t.state_entered_at
   limit 200`;
// D-535: a job's final check has no agent to retry (more units are the job's answer), so self-finish leaves it alone
const PICK = pick("coalesce(t.job_role, '') <> 'final'");

function moveOf(t: Row, now: Date): ReturnType<typeof nextMove> {
  const reasons = Array.isArray(t.reasons) ? t.reasons.filter((r): r is string => typeof r === "string") : [];
  const input: SelfFinishInput = {
    state: t.state, wait_reason: t.wait_reason, last_result: t.last_result, reasons, attempt: t.attempt, attempts_max: t.attempts_max,
    auto_retries: t.auto_retries, ci_rounds: t.ci_rounds, ci_cap: t.ci_cap ?? 2, resets_at: t.resets_at,
    held_since: new Date(t.held_since).toISOString(), now: now.toISOString(), night: t.night,
  };
  return nextMove(input);
}

/** D-535: what self-finish will do with this HELD/BLOCKED task (null: it is not waiting) — a job parks on anything but retry/wait */
export async function selfMoveOf(db: SqlClient, taskId: string, now: Date): Promise<string | null> {
  const t = (await db.query<Row>(pick("t.id = $1"), [taskId])).rows[0];
  return t ? moveOf(t, now).move : null;
}

export async function selfFinishTick(db: Db, o: { now: Date }): Promise<SelfFinishTick> {
  const out: SelfFinishTick = { retried: [], waiting: [] };
  for (const t of (await db.query<Row>(PICK)).rows) {
    const reasons = Array.isArray(t.reasons) ? t.reasons.filter((r): r is string => typeof r === "string") : [];
    const m = moveOf(t, o.now);
    if (m.move === "wait") out.waiting.push(t.id);
    if (m.move !== "retry") continue;
    // D-535: a unit's note names the criteria whose hidden checks failed; D-711: and the failed hidden tests' titles of
    // its own criteria (read here, only for a retry, from the last verdict; never stored on the unit). M4's single-agent
    // arm gets the same, so the comparison stays fair (D-615).
    const failing = Array.isArray(t.failing) ? t.failing.filter((x): x is string => typeof x === "string") : [];
    const titled = m.why === "failed" && (t.job_id !== null || t.kind === "compare");
    const d5 = titled ? await lastD5(db, t.id, t.attempt) : [];
    const compare = t.kind === "compare" && titled ? failingCriteria(d5) : [];
    const note = t.job_id !== null && m.why === "failed"
      ? unitRetryNote(t.attempt + 1, failing, failingTitles(d5, await unitCriteria(db, t.id)))
      : compare.length > 0
      ? unitRetryNote(t.attempt + 1, compare, failingTitles(d5, compare))
      : m.why === "failed"
      ? `${whatStopped({ result: "FAILED", reasons }, t.attempt)}. ${proposalFor(reasons)}`
      : `Mandat started attempt ${t.attempt + 1} by itself: the last one waited on ${m.why}.`;
    if (await retry(db, t, m.retry_reason, m.why, note.slice(0, titled ? RETRY_NOTE_MAX : 500))) out.retried.push(t.id);
  }
  return out;
}

/** D-713: Mandat's own note may be this long (task_activities allows it for kind 'self' only) */
export const RETRY_NOTE_MAX = 1200;

/** D-711: the D5 evidence of a task's last verdict (its failed hidden tests' ids), as core reads evidence */
async function lastD5(db: SqlClient, task: string, attempt: number): Promise<{ detector: string; status: "fail"; data: Record<string, unknown> }[]> {
  const r = await db.query<{ data: Record<string, unknown> }>(
    "select e.data from public.evidence e join public.verdicts v on v.id = e.verdict_id where v.task_id = $1 and v.attempt = $2 and e.detector = 'D5.hidden' and e.status = 'fail' order by v.created_at desc, e.id limit 1",
    [task, attempt],
  );
  return r.rows.map((x) => ({ detector: "D5.hidden", status: "fail" as const, data: x.data }));
}
async function unitCriteria(db: SqlClient, task: string): Promise<string[]> {
  const r = await db.query<{ criteria: unknown }>("select u.criteria from public.tasks t join public.job_units u on u.job_id = t.job_id and u.unit_id = t.unit_id where t.id = $1", [task]);
  const c = r.rows[0]?.criteria;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === "string") : [];
}

/** the new attempt, Mandat's note and the ledger row together (D-713: a refused note must not leave a half-made retry) */
async function retry(db: Db, t: Row, reason: "auto" | "ci", why: string, note: string): Promise<boolean> {
  return inTransaction(db, async (tx) => {
    const r = await tx.query(
      "update public.tasks set state = 'CREATED', attempt = attempt + 1, retry_reason = $4, wait_reason = null, last_result = null, effective_level = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1 and state = $2 and attempt = $3 returning id",
      [t.id, t.state, t.attempt, reason],
    );
    if (r.rows.length === 0) return false;
    await tx.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1::uuid, $2, 'self', $3)", [t.org_id, t.id, note]);
    await appendLedgerOnline(tx, { org_id: t.org_id, kind: "task_retry", task_id: t.id, payload: { attempt: t.attempt + 1, reason, why, by: "mandat" } });
    return true;
  });
}
