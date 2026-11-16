import type { MetricTask } from "../metrics";
import { asUser } from "./sql";
import type { Db } from "./sql";

// Round 2: the rows of the metrics page, read as the person (RLS). A task counts once it ended: its change went in
// (a "delivered" ledger row), it was rejected, stopped or expired, or it failed. A question that was only answered
// changed nothing and is left out. A person's decision: an approval or rejection not by the twin, a run again, a stop.
// Mandat's own retries come from the ledger (a viewer does not see the notes).
const FINISHED = `
  with t as (
    select t.id, t.state, t.wait_reason, t.usd::float8 as usd, t.state_entered_at,
           exists (select 1 from public.ledger l where l.task_id = t.id and l.kind = 'delivered') as delivered
      from public.tasks t
     where t.org_id = $1::uuid and t.state in ('DELIVERED', 'OUTCOME', 'CLOSED', 'BLOCKED') and t.state_entered_at > now() - make_interval(days => $2::int)
  )
  select t.id, to_char(t.state_entered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as finished_at, t.usd,
         case when t.delivered then 'accepted'
              when t.wait_reason = 'rejected' then 'rejected'
              when t.wait_reason in ('stopped', 'expired') then 'stopped'
              when t.state = 'BLOCKED' then 'failed'
              else null end as outcome,
         (select count(*)::int from public.approvals a join public.changesets c on c.id = a.changeset_id where c.task_id = t.id and a.method <> 'twin')
           + (select count(*)::int from public.ledger l where l.task_id = t.id and l.kind in ('task_retry', 'task_stopped') and coalesce(l.payload ->> 'by', '') ~ '^[0-9a-f-]{36}$') as human,
         exists (select 1 from public.approvals a join public.changesets c on c.id = a.changeset_id where c.task_id = t.id and a.method = 'twin') as by_twin,
         (select count(*)::int from public.ledger l where l.task_id = t.id and l.kind = 'task_retry' and l.payload ->> 'by' = 'mandat') as self_retries
    from t`;

export async function metricTasks(db: Db, uid: string, org: string, days: number): Promise<MetricTask[]> {
  const span = Math.max(1, Math.min(Math.floor(days), 400));
  return asUser(db, uid, async (sql) => (await sql.query<MetricTask & { outcome: MetricTask["outcome"] | null }>(FINISHED, [org, span])).rows.filter((r): r is MetricTask => r.outcome !== null));
}

/** The twin's shadow score over all time: its real predictions whose real decision is known (not its own approvals). */
export async function twinScoreOf(db: Db, uid: string, org: string): Promise<{ scored: number; correct: number }> {
  const r = await asUser(db, uid, (sql) => sql.query<{ scored: number; correct: number }>(
    "select count(*)::int as scored, count(*) filter (where predicted = actual)::int as correct from public.twin_predictions where org_id = $1::uuid and not by_twin and predicted <> 'abstain' and actual is not null",
    [org],
  ));
  return r.rows[0] ?? { scored: 0, correct: 0 };
}
