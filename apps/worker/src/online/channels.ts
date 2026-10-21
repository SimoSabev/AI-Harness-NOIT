import type { ChannelRef } from "@mandat/contract";
import type { ChannelState, Rule } from "@mandat/channels";
import type { SqlClient } from "@mandat/ledger";

// Демо промпт т. 8.3: channels of an org from the database (metadata only; the keys live in the proxy's env).
/** D-295: "claude@<profile>" — Claude Code with that subscription profile (volume mandat-profile-claude-<profile>). */
export function profileOfAgent(agent: string): string | null {
  return /^claude@([a-z0-9][a-z0-9-]{0,31})$/.exec(agent)?.[1] ?? null;
}

export const providerOfAgent = (agent: string): "anthropic" | "openai" => (agent === "codex" || agent.startsWith("fake-codex:") ? "openai" : "anthropic");

/** The agent of the other provider after a spill (a fake keeps its scenario when the Codex fake has it). */
export function spillAgent(agent: string, codexFakes: readonly string[]): string {
  if (agent === "claude") return "codex";
  if (agent === "codex") return "claude";
  if (agent.startsWith("fake:")) {
    const s = agent.slice(5);
    return codexFakes.includes(s) ? `fake-codex:${s}` : "fake-codex:honest-fix";
  }
  if (agent.startsWith("fake-codex:")) return `fake:${agent.slice(11)}`;
  return agent;
}

interface Row { id: string; label: string; provider: "anthropic" | "openai"; kind: "api_key" | "cli_profile" | "local"; model: string; enabled: boolean; health: ChannelState["health"]; budget_usd_day: string | null; spent: string; used: number; quality: string; cost: string; cooldown_until: string | null; limit_resets_at: string | null; cooldown_s: number | null }

export async function loadChannels(db: SqlClient, org: string): Promise<(ChannelState & { cooldown_s: number | null })[]> {
  const r = await db.query<Row>(
    `select c.id::text as id, c.label, c.provider, c.kind, c.model, c.enabled, c.health, c.budget_usd_day::text as budget_usd_day, c.quality::text as quality, c.cost::text as cost,
            to_char(c.cooldown_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as cooldown_until, to_char(c.limit_resets_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as limit_resets_at, c.cooldown_s,
            coalesce((select sum(u.usd) from public.channel_usage u where u.channel_id = c.id and u.created_at >= date_trunc('day', now())), 0)::text as spent,
            (select count(*)::int from public.channel_usage u where u.channel_id = c.id and u.created_at >= date_trunc('day', now())) as used
       from public.model_channels c where c.org_id = $1::uuid order by c.label`,
    [org],
  );
  return r.rows.map((x) => ({
    id: x.id, label: x.label, provider: x.provider, kind: x.kind, model: x.model, enabled: x.enabled, health: x.health, budget_usd_day: x.budget_usd_day === null ? null : Number(x.budget_usd_day),
    spent_today_usd: Number(x.spent), used_today: x.used, quality: Number(x.quality), cost: Number(x.cost), cooldown_until: x.cooldown_until, limit_resets_at: x.limit_resets_at, cooldown_s: x.cooldown_s,
  }));
}

export async function ruleFor(db: SqlClient, org: string, repo: string, type: string): Promise<Rule> {
  const r = await db.query<{ mode: "fixed" | "auto"; channel_id: string; fallback: string[] }>(
    "select mode, channel_id::text as channel_id, fallback_channel_ids::text[] as fallback from public.routing_rules where org_id = $1::uuid and (repo_id is null or repo_id = $2::uuid) and (task_type is null or task_type = $3) order by (repo_id is null), (task_type is null), priority limit 1",
    [org, repo, type],
  );
  const x = r.rows[0];
  return x ? { mode: x.mode, channel_id: x.channel_id, fallback_ids: x.fallback ?? [] } : { mode: "auto", channel_id: null, fallback_ids: [] };
}

export const refOf = (c: ChannelState): ChannelRef => ({ label: c.label, kind: c.kind, model: c.model });
