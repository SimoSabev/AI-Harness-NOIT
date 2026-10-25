import { ulid } from "@mandat/contract";
import type { SqlClient } from "@mandat/ledger";
import type { Db } from "./db.js";

// E8f (v5 p. 4.6, AC-4.2, D-355): coordination of the tasks of one repo. A task is "live" from CONTRACTED to GATED; the
// WIP limit of the approved profile (layer G, default 3) caps the live tasks per repo; a task that waits for another
// (same file, same_file: wait) is claimed only when that one is no longer live.
export const LIVE_STATES = ["CONTRACTED", "PROVISIONING", "RUNNING", "EXPORTING", "RETRY", "VERIFY_1", "REBASING", "PUSHED", "VERIFY_2", "VERDICT", "GATED"] as const;
const LIVE = `(${LIVE_STATES.map((s) => `'${s}'`).join(", ")})`;

export interface Touch { task_id: string; started_at: string; files: readonly string[] }
export interface Conflict { file: string; with: string; later: string }

/** Files `me` shares with the other live tasks; `later` = the task that started later (the one that waits). */
export function findConflicts(me: Touch, others: readonly Touch[]): Conflict[] {
  const mine = new Set(me.files);
  const out: Conflict[] = [];
  for (const o of others) {
    if (o.task_id === me.task_id) continue;
    const later = o.started_at > me.started_at ? o.task_id : me.task_id;
    for (const f of o.files) if (mine.has(f)) out.push({ file: f, with: o.task_id, later });
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.with < b.with ? -1 : 1));
}

/** The claim of runDaemonOnce: the oldest CREATED task whose repo has a free slot and which waits for nothing live. */
export async function claimNext(db: Db): Promise<string | null> {
  const c = await db.connect();
  try {
    await c.query("begin");
    const r = await c.query<{ id: string }>(
      `select t.id from public.tasks t
        where t.state = 'CREATED'
          and (t.wait_for is null or not exists (select 1 from public.tasks w where w.id = t.wait_for and w.state in ${LIVE}))
          and (select count(*) from public.tasks o where o.repo_id = t.repo_id and o.state in ${LIVE})
              < coalesce((select (h.layers -> 'g' ->> 'wip_limit')::int from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = t.repo_id), 3)
        order by t.created_at limit 1 for update of t skip locked`,
    );
    const id = r.rows[0]?.id ?? null;
    if (id) await c.query("update public.tasks set state = 'CONTRACTED', state_entered_at = now(), seq = seq + 1 where id = $1", [id]);
    await c.query("commit");
    return id;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** The other live tasks of the repo with the files their sessions touch (agent_sessions.touching). */
export async function liveTouches(db: SqlClient, o: { repoId: string; except: string }): Promise<Touch[]> {
  const r = await db.query<{ task_id: string; started_at: string; files: string[] }>(
    `select t.id as task_id, to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started_at,
            coalesce((select array_agg(distinct f) from public.agent_sessions s, unnest(s.touching) f where s.task_id = t.id and s.state = 'running'), '{}') as files
       from public.tasks t where t.repo_id = $1::uuid and t.id <> $2 and t.state in ${LIVE}`,
    [o.repoId, o.except],
  );
  return r.rows;
}

/** One activity and one security event per file and pair (the card on the start page reads the activities). */
export async function recordConflicts(db: SqlClient, o: { org: string; taskId: string; conflicts: readonly Conflict[] }): Promise<number> {
  let n = 0;
  for (const c of o.conflicts) {
    const text = `${c.file} · ${c.with}`.slice(0, 500);
    const seen = await db.query("select 1 from public.task_activities where task_id = $1 and kind = 'conflict' and text = $2", [o.taskId, text]);
    if (seen.rows.length > 0) continue;
    await db.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1::uuid, $2, 'conflict', $3)", [o.org, o.taskId, text]);
    await db.query("insert into public.security_events (id, org_id, task_id, kind, severity, detail, source) values ($1, $2::uuid, $3, 'conflict_file', 'info', $4::jsonb, 'worker')", [`se_${ulid()}`, o.org, o.taskId, JSON.stringify({ file: c.file, with: c.with, later: c.later })]);
    n++;
  }
  return n;
}
