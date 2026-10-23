import type { Feed, SteerLine, StreamLine } from "../chat";
import { taskRow } from "./queries";
import type { TaskRow } from "./queries";
import { asUser } from "./sql";
import type { Db } from "./sql";

// The workspace chat (live): what is new for one task since the client's cursor — the task row, the stream lines of its
// latest leader session after `after`, the files the run touches (leader + subagents), the context and the person's
// steers. As the user (RLS): viewers read the stream, steers are approver+ (task_activities).
export type TaskFeed = Feed & { task: TaskRow };
const MAX_LINES = 500;
const TS = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function taskFeed(db: Db, uid: string, org: string, id: string, after: number): Promise<TaskFeed | null> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(id)) return null;
  return asUser(db, uid, async (sql) => {
    const task = await taskRow(sql, org, id);
    if (!task) return null;
    const lead = (await sql.query<{ id: string; context_pct: number | null }>(
      "select id, context_pct from public.agent_sessions where org_id = $1::uuid and task_id = $2 and role = 'lead' order by started_at desc limit 1",
      [org, id],
    )).rows[0];
    const steers = (await sql.query<SteerLine>(`select text, ${TS("created_at")} as at from public.task_activities where task_id = $1 and kind = 'steer' order by id limit 200`, [id])).rows;
    const notes = (await sql.query<TaskFeed["notes"][number]>("select kind, text from public.task_activities where task_id = $1 and kind in ('needs_you', 'auto_applied', 'applied') order by id limit 20", [id])).rows;
    if (!lead) return { task, session: null, lines: [], touching: [], context_pct: null, steers, notes };
    const lines = (await sql.query<StreamLine>(
      `select seq, kind, text, ${TS("at")} as at from public.session_lines where session_id = $1 and seq > $2 order by seq limit ${MAX_LINES}`,
      [lead.id, after],
    )).rows;
    const touching = (await sql.query<{ path: string }>(
      "select distinct p as path from public.agent_sessions s, unnest(s.touching) p where s.id = $1 or s.parent_id = $1 order by 1 limit 500",
      [lead.id],
    )).rows.map((r) => r.path);
    return { task, session: lead.id, lines, touching, context_pct: lead.context_pct === null ? null : Number(lead.context_pct), steers, notes };
  });
}
