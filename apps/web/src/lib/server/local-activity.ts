import { LocalActivityBody } from "@mandat/contract";
import type { Result } from "./actions";
import { hasCap } from "./roles";
import { asService } from "./sql";
import type { Db } from "./sql";

// E9g A3 (D-373): the trail of local actions from the desktop app ("Apply locally", "Open in editor"). They happen on
// the person's computer, outside the sandbox and outside the verdict, so they go to task_activities (what happened
// around a task), never to the ledger. The text is built here from a closed set of fields (LocalActivityBody).
const err = (status: number, error: string): Result => ({ status, body: { error } });
const LABEL = { local_apply: "Applied locally", local_editor: "Opened in editor" } as const;

export async function localActivity(db: Db, o: { uid: string; taskId: string; body: unknown }): Promise<Result> {
  const b = LocalActivityBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_activity");
  const t = (await asService(db, (sql) => sql.query<{ org_id: string; repo_id: string; type: string }>("select org_id::text as org_id, repo_id::text as repo_id, type from public.tasks where id = $1", [o.taskId]))).rows[0];
  if (!t) return err(404, "unknown_task");
  if (!(await hasCap(db, o.uid, t.org_id, "diff.view", { repo: t.repo_id, type: t.type }))) return err(403, "not_allowed");
  const text = `${LABEL[b.data.kind]}: ${b.data.outcome}${b.data.detail ? ` (${b.data.detail})` : ""}`.slice(0, 500);
  await asService(db, (sql) => sql.query("insert into public.task_activities (org_id, task_id, kind, text, by_user) values ($1::uuid, $2, $3, $4, $5::uuid)", [t.org_id, o.taskId, b.data.kind, text, o.uid]));
  return { status: 200, body: {}, broadcast: { org: t.org_id, task: o.taskId } };
}
