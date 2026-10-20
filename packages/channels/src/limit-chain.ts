import { selectChannel } from "./select.js";
import type { ChannelState, Selection } from "./select.js";

// Демо промпт т. 8.3 (Ф3 П6 + „Решение 20.10.2026“, В-2): 429 → wait (retry-after ≤ 5 min, up to 3 times) → else
// cooldown until resets_at (without one: 60 s → ×2 → max 1 h) → (1) wait if the reset is soon; (2) cli_profile of ANOTHER
// provider (n/a here); (3) api_key with budget; (4) local (n/a); (5) HELD. A spill is a NEW attempt, at most once per task.
export interface LimitEvent { retryAfterS: number | null; resetsAt: string | null }
export type LimitDecision =
  | { action: "wait"; seconds: number }
  | { action: "spill"; cooldownUntil: string; to: ChannelState; selection: Extract<Selection, { ok: true }> }
  | { action: "held"; cooldownUntil: string; reason: "no_candidate" | "second_spill" };

export const WAIT_MAX_S = 300;
export const WAITS_MAX = 3;

export function nextCooldownS(prev: number | null): number {
  return prev === null ? 60 : Math.min(3600, prev * 2);
}

export function onLimit(o: { ev: LimitEvent; current: ChannelState; waits: number; spills: number; prevCooldownS: number | null; fallbacks: ChannelState[]; estCostUsd: number; now: Date }): LimitDecision {
  const soon = o.ev.resetsAt !== null ? Math.max(0, Math.ceil((Date.parse(o.ev.resetsAt) - o.now.getTime()) / 1000)) : null;
  const wait = o.ev.retryAfterS ?? soon;
  if (wait !== null && wait <= WAIT_MAX_S && o.waits < WAITS_MAX) return { action: "wait", seconds: Math.max(1, wait) };
  const cooldownUntil = o.ev.resetsAt ?? new Date(o.now.getTime() + nextCooldownS(o.prevCooldownS) * 1000).toISOString();
  if (o.spills >= 1) return { action: "held", cooldownUntil, reason: "second_spill" };
  // (2) cli_profile of another provider, (3) api_key — both through the same filter/score; same-provider cli_profile never
  const allowed = o.fallbacks.filter((c) => c.id !== o.current.id && !(c.kind === "cli_profile" && c.provider === o.current.provider));
  const order = [...allowed.filter((c) => c.kind === "cli_profile"), ...allowed.filter((c) => c.kind === "api_key")];
  for (const group of [order.filter((c) => c.kind === "cli_profile"), order.filter((c) => c.kind === "api_key")]) {
    const s = selectChannel(group, { estCostUsd: o.estCostUsd, rule: { mode: "auto", channel_id: null, fallback_ids: [] }, now: o.now, only: group.map((c) => c.id) });
    if (s.ok) return { action: "spill", cooldownUntil, to: s.channel, selection: s };
  }
  return { action: "held", cooldownUntil, reason: "no_candidate" };
}
