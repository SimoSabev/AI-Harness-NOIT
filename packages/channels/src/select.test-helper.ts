import type { ChannelState } from "./select.js";

export const ch = (p: Partial<ChannelState> & { id: string }): ChannelState => ({
  label: p.id, provider: "anthropic", kind: "api_key", model: "claude-sonnet-5-5", enabled: true, health: "ok", budget_usd_day: 3, spent_today_usd: 0,
  quality: 0.9, cost: 0.5, used_today: 0, cooldown_until: null, limit_resets_at: null, ...p,
});
