import type { Result } from "./actions";
import { hasCap } from "./roles";
import { asService } from "./sql";
import type { Db } from "./sql";

// E8g (v5 p. 4.4 (3), AC-8.5, D-353): a person's steer text for a task. The worker hands it to a live steerable agent
// (framed as untrusted input) or puts it into the next attempt's contract. Only the text and its author are stored.
const DONE = new Set(["DELIVERED", "OUTCOME", "CLOSED"]);
const err = (status: number, error: string): Result => ({ status, body: { error } });

export async function steerTask(db: Db, o: { uid: string; taskId: string; text: string }): Promise<Result> {
  const text = o.text.trim();
  if (text.length === 0 || text.length > 500) return err(400, "bad_text");
  const t = (await asService(db, (sql) => sql.query<{ org_id: string; repo_id: string; type: string; state: string; steerable: boolean }>("select org_id::text as org_id, repo_id::text as repo_id, type, state, steerable from public.tasks where id = $1", [o.taskId]))).rows[0];
  if (!t) return err(404, "unknown_task");
  if (!(await hasCap(db, o.uid, t.org_id, "task.steer", { repo: t.repo_id, type: t.type }))) return err(403, "not_allowed");
  if (DONE.has(t.state)) return err(409, "not_steerable");
  await asService(db, (sql) => sql.query("insert into public.task_activities (org_id, task_id, kind, text, by_user) values ($1::uuid, $2, 'steer', $3, $4::uuid)", [t.org_id, o.taskId, text, o.uid]));
  return { status: 200, body: { live: t.steerable && t.state === "RUNNING" }, broadcast: { org: t.org_id, task: o.taskId } };
}
