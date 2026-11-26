// D-629: Settings → Models → Usage. What each account and model cost and what is left, from the facts the harness has:
// what every task and conversation spent (USD, as the agent reported it), the minutes of work, the verdicts, and whether
// the account is in its subscription limit (D-612, D-628). Pure: the page and the test share it. Days are UTC days.

export interface UsageRow { agent: string; model: string | null; kind: "task" | "chat"; usd: number; minutes: number; result: string | null; at: string }
export interface UsageAgent { id: string; label: string; limitedUntil?: string | null }
export type Left = { kind: "free" } | { kind: "limit"; until: string };
export interface AgentUsage {
  id: string; label: string; usd: number; share: number; today: number; tasks: number; chats: number; minutes: number; verified: number;
  models: { model: string; usd: number }[]; left: Left;
}
export interface UsageView {
  totals: { today: number; period: number; tasks: number; chats: number; verified: number; perVerified: number | null; minutes: number };
  rows: AgentUsage[];
  days: { day: string; usd: number }[];
}

const DAY_MS = 86_400_000;
const money = (x: number): number => Math.round(x * 1e6) / 1e6;
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function usageView(all: readonly UsageRow[], agents: readonly UsageAgent[], o: { now: number; days: number }): UsageView {
  const today = dayOf(o.now);
  const first = dayOf(o.now - (o.days - 1) * DAY_MS);
  const rows = all.filter((r) => { const d = dayOf(Date.parse(r.at)); return d >= first && d <= today; });
  const period = money(rows.reduce((s, r) => s + r.usd, 0));
  const by = new Map<string, AgentUsage>();
  const blank = (id: string, label: string, limitedUntil: string | null | undefined): AgentUsage => ({
    id, label, usd: 0, share: 0, today: 0, tasks: 0, chats: 0, minutes: 0, verified: 0, models: [],
    left: limitedUntil && Date.parse(limitedUntil) > o.now ? { kind: "limit", until: limitedUntil } : { kind: "free" },
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
  const list = [...by.values()].map((u) => ({ ...u, share: period > 0 ? u.usd / period : 0, models: [...u.models].sort((a, b) => b.usd - a.usd) }))
    .sort((a, b) => b.usd - a.usd);
  const verified = list.reduce((s, u) => s + u.verified, 0);
  const days = Array.from({ length: o.days }, (_, i) => {
    const day = dayOf(o.now - (o.days - 1 - i) * DAY_MS);
    return { day, usd: money(rows.filter((r) => dayOf(Date.parse(r.at)) === day).reduce((s, r) => s + r.usd, 0)) };
  });
  return {
    totals: {
      today: days.at(-1)?.usd ?? 0, period, tasks: list.reduce((s, u) => s + u.tasks, 0), chats: list.reduce((s, u) => s + u.chats, 0),
      verified, perVerified: verified > 0 ? money(period / verified) : null, minutes: list.reduce((s, u) => s + u.minutes, 0),
    },
    rows: list,
    days,
  };
}
