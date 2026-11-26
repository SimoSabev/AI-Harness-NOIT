import { jcs, sha256Tag } from "@mandat/contract";
import type { Result } from "./actions";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";

// D-628: "Continue with another account" — a task its subscription's limit holds (HELD channel_limit, D-607) starts a
// new attempt now with another agent the box offers (an account not in its limit, a key, a local model), on that agent's
// default model. The ledger says who switched, from which agent to which (only ids). An approver only.
export async function switchAccount(db: Db, o: { uid: string; taskId: string; agent: string; targets: readonly { id: string; defaultModel: string | null }[] }): Promise<Result> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(o.taskId)) return { status: 404, body: { error: "unknown_task" } };
  const t = (await asService(db, (sql) => sql.query<{ org_id: string; state: string; wait_reason: string | null; agent: string; attempt: number }>("select org_id::text as org_id, state, wait_reason, agent, attempt from public.tasks where id = $1", [o.taskId]))).rows[0];
  if (!t) return { status: 404, body: { error: "unknown_task" } };
  const ok = await asUser(db, o.uid, async (sql) => (await sql.query<{ ok: boolean }>("select private.authorize('approver', $1::uuid) as ok", [t.org_id])).rows[0]?.ok === true);
  if (!ok) return { status: 403, body: { error: "not_an_approver" } };
  if (t.state !== "HELD" || t.wait_reason !== "channel_limit") return { status: 409, body: { error: "not_at_limit" } };
  const to = o.targets.find((a) => a.id === o.agent && a.id !== t.agent);
  if (!to) return { status: 400, body: { error: "unknown_agent" } };
  await asService(db, async (sql) => {
    await sql.query("update public.tasks set agent = $2, model = $3, attempt = attempt + 1, retry_reason = 'human', state = 'CREATED', wait_reason = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [o.taskId, to.id, to.defaultModel]);
    const text = jcs({ by: o.uid, from: t.agent, to: to.id });
    await sql.query("select private.ledger_append($1::uuid, 'channel_manual_switch', $2, $3, $4)", [t.org_id, o.taskId, text, sha256Tag(text)]);
  });
  return { status: 200, body: { agent: to.id, attempt: t.attempt + 1 }, broadcast: { org: t.org_id, task: o.taskId } };
}
