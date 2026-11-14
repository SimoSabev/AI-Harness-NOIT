import { nextMove } from "@mandat/core";
import type { SelfFinishInput } from "@mandat/core";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import type { VerdictResult } from "@mandat/contract";
import { proposalFor, whatStopped } from "./night-rules.js";

// Round 1, feature 1 „Сам довършва“ (D-521): the daytime tick (beside the night tick) that applies core's nextMove to
// HELD and BLOCKED tasks. A retry is a new attempt with Mandat's own note (task_activities kind 'self', read by the
// daemon into the contract like the night note) and a task_retry ledger row by "mandat". The update is guarded by the
// state and the attempt it read, so a person who acted in between wins.
export interface SelfFinishTick { retried: string[]; waiting: string[] }

interface Row {
  id: string; org_id: string; state: string; wait_reason: string | null; last_result: VerdictResult | null; attempt: number; attempts_max: number;
  ci_rounds: number; ci_cap: number | null; held_since: string; night: boolean; auto_retries: number; resets_at: string | null; reasons: unknown;
}

const PICK = `
  select t.id, t.org_id::text as org_id, t.state, t.wait_reason, t.last_result, t.attempt, t.attempts_max, t.ci_rounds,
         (select (h.layers -> 'g' ->> 'ci_rounds')::int from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = t.repo_id) as ci_cap,
         t.state_entered_at::text as held_since, t.shift_id is not null as night,
         (select count(*)::int from public.task_activities a where a.task_id = t.id and a.kind = 'self') as auto_retries,
         (select l.payload ->> 'resets_at' from public.ledger l where l.task_id = t.id and l.kind = 'channel_limit' order by l.seq desc limit 1) as resets_at,
         (select v.reasons from public.verdicts v where v.task_id = t.id and v.attempt = t.attempt order by v.created_at desc limit 1) as reasons
    from public.tasks t
   where t.state in ('HELD', 'BLOCKED')
   order by t.state_entered_at
   limit 200`;

export async function selfFinishTick(db: SqlClient, o: { now: Date }): Promise<SelfFinishTick> {
  const out: SelfFinishTick = { retried: [], waiting: [] };
  for (const t of (await db.query<Row>(PICK)).rows) {
    const reasons = Array.isArray(t.reasons) ? t.reasons.filter((r): r is string => typeof r === "string") : [];
    const input: SelfFinishInput = {
      state: t.state, wait_reason: t.wait_reason, last_result: t.last_result, reasons, attempt: t.attempt, attempts_max: t.attempts_max,
      auto_retries: t.auto_retries, ci_rounds: t.ci_rounds, ci_cap: t.ci_cap ?? 2, resets_at: t.resets_at,
      held_since: new Date(t.held_since).toISOString(), now: o.now.toISOString(), night: t.night,
    };
    const m = nextMove(input);
    if (m.move === "wait") out.waiting.push(t.id);
    if (m.move !== "retry") continue;
    const note = m.why === "failed"
      ? `${whatStopped({ result: "FAILED", reasons }, t.attempt)}. ${proposalFor(reasons)}`
      : `Mandat started attempt ${t.attempt + 1} by itself: the last one waited on ${m.why}.`;
    if (await retry(db, t, m.retry_reason, m.why, note.slice(0, 500))) out.retried.push(t.id);
  }
  return out;
}

async function retry(db: SqlClient, t: Row, reason: "auto" | "ci", why: string, note: string): Promise<boolean> {
  const r = await db.query(
    "update public.tasks set state = 'CREATED', attempt = attempt + 1, retry_reason = $4, wait_reason = null, last_result = null, effective_level = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1 and state = $2 and attempt = $3 returning id",
    [t.id, t.state, t.attempt, reason],
  );
  if (r.rows.length === 0) return false;
  await db.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1::uuid, $2, 'self', $3)", [t.org_id, t.id, note]);
  await appendLedgerOnline(db, { org_id: t.org_id, kind: "task_retry", task_id: t.id, payload: { attempt: t.attempt + 1, reason, why, by: "mandat" } });
  return true;
}
