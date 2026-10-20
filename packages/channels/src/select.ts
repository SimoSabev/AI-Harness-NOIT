// Демо промпт т. 8.3 (Ф3 П4): channel choice in CONTRACTED, before contract_hash. Filter → score = 0.5·Q + 0.3·(1 − C)
// + 0.2·H → tie → least-used → label. The channel never changes in the middle of an attempt.
export type Provider = "anthropic" | "openai";
export type ChannelKind = "api_key" | "cli_profile" | "local";
export type Health = "ok" | "degraded" | "down" | "limited";
export interface ChannelState {
  id: string;
  label: string;
  provider: Provider;
  kind: ChannelKind;
  model: string;
  enabled: boolean;
  health: Health;
  budget_usd_day: number | null;
  spent_today_usd: number;
  /** 0..1 quality of the model for the task type (static table per org) */
  quality: number;
  /** 0..1 relative cost (1 = the most expensive candidate) */
  cost: number;
  used_today: number;
  cooldown_until: string | null;
  limit_resets_at: string | null;
}
export interface Rule { mode: "fixed" | "auto"; channel_id: string | null; fallback_ids: string[] }
export interface ChannelReason { Q: number; C: number; H: number; score: number; rule: "fixed" | "auto" | "fallback" }
export type Selection = { ok: true; channel: ChannelState; reason: ChannelReason } | { ok: false; excluded: { label: string; why: string }[] };

const H_OF: Record<Health, number> = { ok: 1, degraded: 0.5, limited: 0, down: 0 };
const round = (x: number) => Math.round(x * 1e6) / 1e6;

export function excludeReason(c: ChannelState, estCostUsd: number, now: Date): string | null {
  if (!c.enabled) return "disabled";
  if (c.health !== "ok") return `health ${c.health}`;
  if (c.cooldown_until !== null && Date.parse(c.cooldown_until) > now.getTime()) return "cooldown";
  if (c.kind === "api_key" && c.budget_usd_day !== null && c.budget_usd_day - c.spent_today_usd < estCostUsd * 1.5) return "budget";
  if (c.kind !== "api_key") return `${c.kind} n/a in this prompt`;
  return null;
}

export function selectChannel(all: ChannelState[], o: { estCostUsd: number; rule: Rule; now: Date; only?: string[] }): Selection {
  const pool = o.only ? all.filter((c) => o.only?.includes(c.id)) : o.rule.mode === "fixed" && o.rule.channel_id ? all.filter((c) => c.id === o.rule.channel_id) : all;
  const excluded: { label: string; why: string }[] = [];
  const ok = pool.filter((c) => {
    const why = excludeReason(c, o.estCostUsd, o.now);
    if (why) excluded.push({ label: c.label, why });
    return why === null;
  });
  if (ok.length === 0) return { ok: false, excluded };
  const scored = ok.map((c) => ({ c, s: 0.5 * c.quality + 0.3 * (1 - c.cost) + 0.2 * H_OF[c.health] }));
  scored.sort((a, b) => (Math.abs(b.s - a.s) > 1e-9 ? b.s - a.s : a.c.used_today !== b.c.used_today ? a.c.used_today - b.c.used_today : a.c.label < b.c.label ? -1 : 1));
  const best = scored[0] as { c: ChannelState; s: number };
  return { ok: true, channel: best.c, reason: { Q: best.c.quality, C: best.c.cost, H: H_OF[best.c.health], score: round(best.s), rule: o.only ? "fallback" : o.rule.mode } };
}
