import { z } from "zod";
import { manualSwitchAllowed } from "@mandat/channels";
import type { ChannelState, Health } from "@mandat/channels";
import { jcs, sha256Tag } from "@mandat/contract";
import type { Result } from "./actions";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";

// Demo prompt §8.3: /channels shows ONLY metadata (never keys: they live in the proxy's env, D-224);
// POST /api/tasks/:id/switch-channel (approver, while HELD) → channel_manual_switch.
export interface ChannelView {
  id: string; label: string; provider: "anthropic" | "openai"; kind: "api_key" | "cli_profile" | "local"; model: string; enabled: boolean; health: Health;
  budget_usd_day: number | null; spent_today_usd: number; cooldown_until: string | null; limit_resets_at: string | null; last_error: string | null;
}
const COLUMNS = "c.id::text as id, c.label, c.provider, c.kind, c.model, c.enabled, c.health, c.budget_usd_day::float8 as budget_usd_day, c.last_error, to_char(c.cooldown_until at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as cooldown_until, to_char(c.limit_resets_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as limit_resets_at, coalesce((select sum(u.usd) from public.channel_usage u where u.channel_id = c.id and u.created_at >= date_trunc('day', now())), 0)::float8 as spent_today_usd";

export async function listChannels(db: Db, uid: string, org: string): Promise<ChannelView[]> {
  return asUser(db, uid, async (sql) => (await sql.query<ChannelView>(`select ${COLUMNS} from public.model_channels c where c.org_id = $1::uuid order by c.label`, [org])).rows);
}

export const SwitchBody = z.object({ channel_id: z.string().uuid() }).strict();

const state = (c: ChannelView): ChannelState => ({ ...c, quality: 0, cost: 0, used_today: 0 });

export async function switchChannel(db: Db, o: { uid: string; taskId: string; body: z.infer<typeof SwitchBody> }): Promise<Result> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(o.taskId)) return { status: 404, body: { error: "unknown_task" } };
  const t = (await asService(db, (sql) => sql.query<{ org_id: string; state: string; channel_id: string | null; agent: string; attempt: number }>("select org_id::text as org_id, state, channel_id::text as channel_id, agent, attempt from public.tasks where id = $1", [o.taskId]))).rows[0];
  if (!t) return { status: 404, body: { error: "unknown_task" } };
  const ok = await asUser(db, o.uid, async (sql) => (await sql.query<{ ok: boolean }>("select private.authorize('approver', $1::uuid) as ok", [t.org_id])).rows[0]?.ok === true);
  if (!ok) return { status: 403, body: { error: "not_an_approver" } };
  if (t.state !== "HELD") return { status: 409, body: { error: "not_held" } };
  const all = await listChannels(db, o.uid, t.org_id);
  const to = all.find((c) => c.id === o.body.channel_id);
  const from = all.find((c) => c.id === t.channel_id);
  if (!to) return { status: 404, body: { error: "unknown_channel" } };
  if (from && !manualSwitchAllowed(state(from), state(to))) return { status: 403, body: { error: "same_provider_profile" } };
  const agent = from && from.provider !== to.provider ? (to.provider === "openai" ? (t.agent.startsWith("fake:") ? "fake-codex:honest-fix" : "codex") : t.agent.startsWith("fake-codex:") ? "fake:honest-fix" : "claude") : t.agent;
  await asService(db, async (sql) => {
    await sql.query("update public.tasks set channel_id = $2::uuid, agent = $3, attempt = attempt + 1, retry_reason = 'human', state = 'CREATED', wait_reason = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [o.taskId, to.id, agent]);
    const payload = { by: o.uid, from: from?.label ?? null, to: to.label };
    const text = jcs(payload);
    await sql.query("select private.ledger_append($1::uuid, 'channel_manual_switch', $2, $3, $4)", [t.org_id, o.taskId, text, sha256Tag(text)]);
  });
  return { status: 200, body: { channel: to.label, agent, attempt: t.attempt + 1 }, broadcast: { org: t.org_id, task: o.taskId } };
}
