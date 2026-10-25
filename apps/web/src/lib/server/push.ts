import { z } from "zod";
import { checkPushEndpoint } from "@mandat/worker/push";
import type { Result } from "./actions";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";

// Demo prompt §8.4: POST /api/push/subscribe → push_subscriptions; the endpoint passes the SSRF check on write
// (the worker checks it again on every send). Only the subscription's public parts are stored.
export const SubscribeBody = z.object({
  endpoint: z.string().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }).strict(),
}).strict();

export async function subscribePush(db: Db, o: { uid: string; org: string; body: z.infer<typeof SubscribeBody>; check?: typeof checkPushEndpoint }): Promise<Result> {
  const c = await (o.check ?? checkPushEndpoint)(o.body.endpoint);
  if (!c.ok) return { status: 400, body: { error: `endpoint_${c.reason}` } };
  const member = await asUser(db, o.uid, async (sql) => (await sql.query<{ ok: boolean }>("select private.authorize('viewer', $1::uuid) as ok", [o.org])).rows[0]?.ok === true);
  if (!member) return { status: 403, body: { error: "no_org" } };
  await asService(db, async (sql) => {
    await sql.query("delete from public.push_subscriptions where user_id = $1::uuid and endpoint = $2", [o.uid, o.body.endpoint]);
    await sql.query("insert into public.push_subscriptions (org_id, user_id, endpoint, p256dh, auth) values ($1::uuid, $2::uuid, $3, $4, $5)", [o.org, o.uid, o.body.endpoint, o.body.keys.p256dh, o.body.keys.auth]);
  });
  return { status: 201, body: { subscribed: true } };
}
