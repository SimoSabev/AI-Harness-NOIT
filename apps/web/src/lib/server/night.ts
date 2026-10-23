import { z } from "zod";
import { NightPlan, NightQueueWrite, TaskType, jcs, sha256Tag } from "@mandat/contract";
import type { Result } from "./actions";
import { hasCap } from "./roles";
import { asService } from "./sql";
import type { Db, Sql } from "./sql";

// v5 E9а (5.1 (2), D-320): a person plans the night (queue, rules, budget); in the morning a parked task's question is
// answered ("Answer and continue": a new attempt with the answer as a person's note, framed by the worker like a steer)
// or closed. All of it needs night.manage; the worker runs the shift.
export const NightPlanBody = NightPlan.extend({ queue: z.array(NightQueueWrite.extend({ type: TaskType.default("bugfix") })).min(1).max(50) })
  .strict()
  .refine((p) => Date.parse(p.ends_at) > Date.parse(p.starts_at) && Date.parse(p.ends_at) > Date.now(), { message: "the shift must end after it starts and in the future" });
const err = (status: number, error: string): Result => ({ status, body: { error } });

async function ledger(sql: Sql, org: string, kind: string, task: string | null, payload: Record<string, unknown>): Promise<void> {
  const text = jcs(payload);
  await sql.query("select private.ledger_append($1::uuid, $2, $3, $4, $5)", [org, kind, task, text, sha256Tag(text)]);
}

export async function planNight(db: Db, o: { uid: string; org: string; body: unknown }): Promise<Result> {
  if (!(await hasCap(db, o.uid, o.org, "night.manage"))) return err(403, "not_allowed");
  const b = NightPlanBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_plan");
  const p = b.data;
  const id = await asService(db, async (sql) => {
    const open = (await sql.query("select 1 from public.night_shifts where org_id = $1::uuid and status in ('planned', 'running') limit 1", [o.org])).rows.length > 0;
    if (open) return null;
    const repos = new Set((await sql.query<{ id: string }>("select id::text as id from public.repos where org_id = $1::uuid", [o.org])).rows.map((r) => r.id));
    if (p.queue.some((q) => !repos.has(q.repo_id))) return "bad_repo";
    const s = (await sql.query<{ id: string }>("insert into public.night_shifts (org_id, starts_at, ends_at, budget_usd, rules, created_by) values ($1::uuid, $2, $3, $4, $5::jsonb, $6::uuid) returning id::text as id", [o.org, p.starts_at, p.ends_at, p.budget_usd, JSON.stringify(p.rules), o.uid])).rows[0]?.id as string;
    for (const [i, q] of p.queue.entries()) {
      await sql.query("insert into public.night_queue (org_id, shift_id, repo_id, position, text, type, risk, est_minutes, est_usd) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)", [o.org, s, q.repo_id, i, q.text, q.type, q.risk, q.est_minutes, q.est_usd]);
    }
    return s;
  });
  if (id === null) return err(409, "shift_open");
  if (id === "bad_repo") return err(400, "bad_repo");
  return { status: 201, body: { id } };
}

type Q = { org_id: string; task_id: string; status: string; repo_id: string; type: string };
async function question(db: Db, id: string): Promise<Q | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await asService(db, (sql) => sql.query<Q>("select q.org_id::text as org_id, q.task_id, q.status, t.repo_id::text as repo_id, t.type from public.night_questions q join public.tasks t on t.id = q.task_id where q.id = $1::uuid", [id]))).rows[0] ?? null;
}

export async function answerQuestion(db: Db, o: { uid: string; id: string; answer: string }): Promise<Result> {
  const q = await question(db, o.id);
  if (!q) return err(404, "unknown_question");
  if (!(await hasCap(db, o.uid, q.org_id, "night.manage", { repo: q.repo_id, type: q.type }))) return err(403, "not_allowed");
  const answer = o.answer.trim();
  if (answer.length === 0 || answer.length > 500) return err(400, "bad_answer");
  if (q.status !== "open") return err(409, "not_open");
  await asService(db, async (sql) => {
    await sql.query("update public.night_questions set status = 'answered', answer = $2, answered_by = $3::uuid, answered_at = now() where id = $1::uuid", [o.id, answer, o.uid]);
    await sql.query("insert into public.task_activities (org_id, task_id, kind, text, by_user) values ($1::uuid, $2, 'steer', $3, $4::uuid)", [q.org_id, q.task_id, answer, o.uid]);
    const t = (await sql.query<{ attempt: number }>("update public.tasks set attempt = attempt + 1, retry_reason = 'human', state = 'CREATED', wait_reason = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1 returning attempt", [q.task_id])).rows[0];
    await ledger(sql, q.org_id, "task_retry", q.task_id, { attempt: t?.attempt ?? null, reason: "night_answer" });
  });
  return { status: 200, body: { task_id: q.task_id }, broadcast: { org: q.org_id, task: q.task_id } };
}

export async function closeQuestion(db: Db, o: { uid: string; id: string }): Promise<Result> {
  const q = await question(db, o.id);
  if (!q) return err(404, "unknown_question");
  if (!(await hasCap(db, o.uid, q.org_id, "night.manage", { repo: q.repo_id, type: q.type }))) return err(403, "not_allowed");
  if (q.status !== "open") return err(409, "not_open");
  await asService(db, async (sql) => {
    await sql.query("update public.night_questions set status = 'closed', answered_by = $2::uuid, answered_at = now() where id = $1::uuid", [o.id, o.uid]);
    await sql.query("update public.tasks set state = 'CLOSED', wait_reason = 'parked_closed', state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [q.task_id]);
    await ledger(sql, q.org_id, "task_stopped", q.task_id, { reason: "parked_closed" });
  });
  return { status: 200, body: { task_id: q.task_id }, broadcast: { org: q.org_id, task: q.task_id } };
}
