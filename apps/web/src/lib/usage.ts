import { parseAgentRef } from "@mandat/contract";
import type { LimitSnapshot, LimitWindowStatus } from "@mandat/contract";

// D-629: Settings → Models → Usage. What each account and model cost and what is left, from the facts the harness has:
// what every task and conversation spent (USD, as the agent reported it), the minutes of work, the verdicts, and whether
// the account is in its subscription limit (D-612, D-628). Pure: the page and the test share it. Days are UTC days.
// D-647: what is left depends on how the account pays. A subscription shows its provider's own windows (5 h, week, …) as
// its CLI last reported them, with what is left and the reset; a key or a connection shows money; an account whose
// provider said nothing yet says so. Only money paid per use is "spent": a subscription's amount is the value of the work.

export interface UsageRow { agent: string; model: string | null; kind: "task" | "chat"; usd: number; minutes: number; result: string | null; at: string }
export interface UsageAgent { id: string; label: string; limitedUntil?: string | null }
/** plan = a subscription (a fixed price, limited by windows); key = paid per use; free = a demo agent */
export type Billing = "plan" | "key" | "free";
export interface WindowLeft { id: string; minutes: number | null; left: number | null; resetsAt: string | null; status: LimitWindowStatus | null; reset: boolean }
export type Left =
  | { kind: "windows"; windows: WindowLeft[]; seen: string; limitedUntil: string | null }
  | { kind: "no_data"; limitedUntil: string | null }
  | { kind: "money"; today: number; period: number }
  | { kind: "free" };
export interface AgentUsage {
  id: string; label: string; billing: Billing; usd: number; share: number; today: number; tasks: number; chats: number; minutes: number; verified: number;
  models: { model: string; usd: number }[]; left: Left;
  /** a subscription: how much of its longest window is used (null = no window known, or not a subscription) */
  planUsed: { id: string; minutes: number | null; used: number } | null;
}
export interface UsageView {
  /** today, period and perVerified are money paid per use; value = what the subscriptions' work would have cost */
  totals: { today: number; period: number; value: number; tasks: number; chats: number; verified: number; perVerified: number | null; minutes: number };
  rows: AgentUsage[];
  days: { day: string; usd: number }[];
}

const DAY_MS = 86_400_000;
const money = (x: number): number => Math.round(x * 1e6) / 1e6;
const frac = (x: number): number => Math.round(x * 1e4) / 1e4;
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function billingOf(agent: string): Billing {
  const r = parseAgentRef(agent);
  if (r === null) return "key";
  if (!("via" in r)) return "free";
  return r.via.kind === "account" ? "plan" : "key";
}

/** the windows of a snapshot as of now: shortest first; a window whose reset has passed is full again */
function windowsLeft(s: LimitSnapshot, now: number): WindowLeft[] {
  return s.windows
    .map((w): WindowLeft => {
      const passed = w.resets_at !== null && Date.parse(w.resets_at) <= now;
      if (passed) return { id: w.id, minutes: w.minutes, left: 1, resetsAt: null, status: null, reset: true };
      return { id: w.id, minutes: w.minutes, left: w.used === null ? null : frac(Math.max(0, 1 - w.used)), resetsAt: w.resets_at, status: w.status, reset: false };
    })
    .sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));
}

export function usageView(all: readonly UsageRow[], agents: readonly UsageAgent[], o: { now: number; days: number; windows?: Readonly<Record<string, LimitSnapshot>> }): UsageView {
  const today = dayOf(o.now);
  const first = dayOf(o.now - (o.days - 1) * DAY_MS);
  const rows = all.filter((r) => { const d = dayOf(Date.parse(r.at)); return d >= first && d <= today; });
  const paid = rows.filter((r) => billingOf(r.agent) !== "plan");
  const period = money(paid.reduce((s, r) => s + r.usd, 0));
  const by = new Map<string, AgentUsage>();
  const blank = (id: string, label: string, limitedUntil: string | null | undefined): AgentUsage => ({
    id, label, billing: billingOf(id), usd: 0, share: 0, today: 0, tasks: 0, chats: 0, minutes: 0, verified: 0, models: [], planUsed: null,
    left: { kind: "no_data", limitedUntil: limitedUntil && Date.parse(limitedUntil) > o.now ? limitedUntil : null },
  });
  for (const a of agents) by.set(a.id, blank(a.id, a.label, a.limitedUntil));
  for (const r of rows) {
    const u = by.get(r.agent) ?? blank(r.agent, r.agent, null);
    by.set(r.agent, u);
    u.usd = money(u.usd + r.usd);
    if (dayOf(Date.parse(r.at)) === today) u.today = money(u.today + r.usd);
    if (r.kind === "task") u.tasks += 1; else u.chats += 1;
    u.minutes += r.minutes;
    if (r.result === "VERIFIED") u.verified += 1;
    const m = r.model ?? "—";
    const mu = u.models.find((x) => x.model === m);
    if (mu) mu.usd = money(mu.usd + r.usd); else u.models.push({ model: m, usd: money(r.usd) });
  }
  const leftOf = (u: AgentUsage): Pick<AgentUsage, "left" | "planUsed"> => {
    if (u.billing === "free") return { left: { kind: "free" }, planUsed: null };
    if (u.billing === "key") return { left: { kind: "money", today: u.today, period: u.usd }, planUsed: null };
    const limitedUntil = u.left.kind === "no_data" ? u.left.limitedUntil : null;
    const s = o.windows?.[u.id];
    if (!s) return { left: { kind: "no_data", limitedUntil }, planUsed: null };
    const ws = windowsLeft(s, o.now);
    const longest = ws.at(-1);
    const planUsed = longest && longest.left !== null ? { id: longest.id, minutes: longest.minutes, used: frac(1 - longest.left) } : null;
    return { left: { kind: "windows", windows: ws, seen: s.at, limitedUntil }, planUsed };
  };
  const rank: Record<Billing, number> = { key: 0, plan: 1, free: 2 };
  const list = [...by.values()]
    .map((u) => ({ ...u, ...leftOf(u), share: u.billing !== "plan" && period > 0 ? u.usd / period : 0, models: [...u.models].sort((a, b) => b.usd - a.usd) }))
    .sort((a, b) => rank[a.billing] - rank[b.billing] || b.usd - a.usd);
  const verified = list.reduce((s, u) => s + u.verified, 0);
  const days = Array.from({ length: o.days }, (_, i) => {
    const day = dayOf(o.now - (o.days - 1 - i) * DAY_MS);
    return { day, usd: money(paid.filter((r) => dayOf(Date.parse(r.at)) === day).reduce((s, r) => s + r.usd, 0)) };
  });
  return {
    totals: {
      today: days.at(-1)?.usd ?? 0, period, value: money(list.filter((u) => u.billing === "plan").reduce((s, u) => s + u.usd, 0)),
      tasks: list.reduce((s, u) => s + u.tasks, 0), chats: list.reduce((s, u) => s + u.chats, 0),
      verified, perVerified: verified > 0 ? money(period / verified) : null, minutes: list.reduce((s, u) => s + u.minutes, 0),
    },
    rows: list,
    days,
  };
}

const SPAN_PREFIX = /^(?:[a-z]+_(?:hour|day|week|month)s?|hourly|daily|weekly|monthly)(?:_|$)/;
/** D-647: a window's length as a person says it (5 h, a day, a week), from its minutes; the rest of the provider's name
 * is its scope (seven_day_opus → a week, Opus). A one-word scope is a model name and starts with a capital. */
export function windowSpan(w: { id: string; minutes: number | null }): { span: "hours" | "day" | "week" | "minutes" | "other"; n: number; scope: string | null } {
  const rest = w.minutes === null ? w.id : w.id.replace(SPAN_PREFIX, "");
  const words = rest.split("_").filter(Boolean);
  const scope = words.length === 0 ? null : words.length === 1 && w.minutes !== null ? (words[0] as string).charAt(0).toUpperCase() + (words[0] as string).slice(1) : words.join(" ");
  const m = w.minutes;
  if (m === null) return { span: "other", n: 0, scope };
  if (m % 10080 === 0) return { span: "week", n: m / 10080, scope };
  if (m % 1440 === 0) return { span: "day", n: m / 1440, scope };
  if (m % 60 === 0) return { span: "hours", n: m / 60, scope };
  return { span: "minutes", n: m, scope };
}
