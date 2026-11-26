import { LEARN_LIMITS } from "@mandat/contract";
import type { LearnCard } from "@mandat/contract";

// E9д (spec 5.5, PRD 6.11 т. 3–6, D-642): deterministic statistics over what the ledger already holds. Q and the cost
// forecast feed the channel choice and the default budget; the A/B table and the regression cards are for a person.

const DAY = 86_400_000;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;

// ── channel quality ──────────────────────────────────────────────────────────
export interface OutcomeRow { channel_id: string; task_type: string; at: string; /** VERIFIED and merged with a success outcome */ good: boolean }
export interface Quality { q: number; n: number }

/** Q by "<channel>|<task type>": the weighted share of good outcomes; an outcome `half_life_days` old weighs half. */
export function channelQuality(rows: readonly OutcomeRow[], now: Date, halfLifeDays: number = LEARN_LIMITS.q_half_life_days): Map<string, Quality> {
  const acc = new Map<string, { w: number; good: number; n: number }>();
  for (const r of rows) {
    const at = Date.parse(r.at);
    if (!Number.isFinite(at) || at > now.getTime()) continue;
    const w = 0.5 ** ((now.getTime() - at) / DAY / halfLifeDays);
    const k = `${r.channel_id}|${r.task_type}`;
    const a = acc.get(k) ?? { w: 0, good: 0, n: 0 };
    acc.set(k, { w: a.w + w, good: a.good + (r.good ? w : 0), n: a.n + 1 });
  }
  return new Map([...acc.entries()].map(([k, a]) => [k, { q: r3(a.good / a.w), n: a.n }]));
}

/** The channels with the learned Q for the task type where it rests on ≥ 10 outcomes; the static one elsewhere. */
export function learnedQuality<T extends { id: string; quality: number }>(channels: readonly T[], q: ReadonlyMap<string, Quality>, taskType: string): T[] {
  return channels.map((c) => {
    const l = q.get(`${c.id}|${taskType}`);
    return l && l.n >= LEARN_LIMITS.q_min_outcomes ? { ...c, quality: l.q } : c;
  });
}

// ── cost ─────────────────────────────────────────────────────────────────────
export interface CostRow { repo_id: string; task_type: string; agent: string; usd: number; at: string }
export interface CostKey { repo_id: string; task_type: string; agent: string }
export interface Forecast { forecast_usd: number; budget_usd: number; n: number }
/** the maximum of a policy's budgets.task_usd */
const TASK_USD_MAX = 20;

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const sameKey = (r: CostRow, k: CostKey) => r.repo_id === k.repo_id && r.task_type === k.task_type && r.agent === k.agent;
const paid = (r: CostRow) => r.usd > 0 && Number.isFinite(r.usd) && Number.isFinite(Date.parse(r.at));

/** The median of the last 10 paid tasks of (repo, type, agent); the default budget is twice that (at most 20 USD). */
export function costForecast(history: readonly CostRow[], key: CostKey): Forecast | null {
  const last = history.filter((r) => sameKey(r, key) && paid(r)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, LEARN_LIMITS.cost_last_n);
  if (last.length === 0) return null;
  const f = median(last.map((r) => r.usd));
  return { forecast_usd: r2(f), budget_usd: Math.min(TASK_USD_MAX, r2(f * LEARN_LIMITS.cost_budget_factor)), n: last.length };
}

/**
 * AC-11.3, measured walking forward: each task with ≥ `minPrior` earlier paid tasks of its kind is forecast from those
 * alone; it counts as within when |forecast − real| ≤ tolerance × real.
 */
export function forecastAccuracy(history: readonly CostRow[], o: { minPrior?: number; tolerance?: number } = {}): { tasks: number; within: number; share: number | null } {
  const minPrior = o.minPrior ?? 20;
  const tol = o.tolerance ?? 0.5;
  const rows = history.filter(paid).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let tasks = 0;
  let within = 0;
  rows.forEach((r, i) => {
    const prior = rows.slice(0, i).filter((x) => sameKey(x, r));
    if (prior.length < minPrior) return;
    const f = costForecast(prior, r);
    if (!f) return;
    tasks++;
    if (Math.abs(f.forecast_usd - r.usd) <= tol * r.usd + 1e-9) within++;
  });
  return { tasks, within, share: tasks ? r3(within / tasks) : null };
}

// ── profile A/B ──────────────────────────────────────────────────────────────
export interface VersionRow { version: number; task_type: string; result: "VERIFIED" | "FAILED" | "UNKNOWN"; attempts: number; usd: number }
export interface VersionStats { version: number; tasks: number; verified_share: number | null; avg_rounds: number | null; avg_usd: number | null }
export interface AbTable { task_types: string[]; a: VersionStats; b: VersionStats }

/** Version B against A over the task types both ran (only statistics; the rules screen shows it as „версия B срещу A“). */
export function profileAB(rows: readonly VersionRow[], a: number, b: number): AbTable {
  const typesOf = (v: number) => new Set(rows.filter((r) => r.version === v).map((r) => r.task_type));
  const ta = typesOf(a);
  const types = [...typesOf(b)].filter((t) => ta.has(t)).sort();
  const stats = (v: number): VersionStats => {
    const xs = rows.filter((r) => r.version === v && types.includes(r.task_type));
    if (xs.length === 0) return { version: v, tasks: 0, verified_share: null, avg_rounds: null, avg_usd: null };
    const avg = (f: (r: VersionRow) => number) => r3(xs.reduce((s, r) => s + f(r), 0) / xs.length);
    return { version: v, tasks: xs.length, verified_share: avg((r) => (r.result === "VERIFIED" ? 1 : 0)), avg_rounds: avg((r) => r.attempts), avg_usd: avg((r) => r.usd) };
  };
  return { task_types: types, a: stats(a), b: stats(b) };
}

// ── model regressions ────────────────────────────────────────────────────────
export interface WeekRow { /** "<agent>:<model>" */ model: string; at: string; verified: boolean }

/** the Monday (UTC) of the week of t, as YYYY-MM-DD */
const mondayOf = (t: number): string => {
  const d = new Date(t);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
};

/** The last full week against the one before, per model: a relative fall of the VERIFIED share > 20% → a card. */
export function modelRegression(rows: readonly WeekRow[], now: Date): LearnCard[] {
  const thisWeek = Date.parse(`${mondayOf(now.getTime())}T00:00:00.000Z`);
  const week = mondayOf(thisWeek - 7 * DAY);
  const prev = mondayOf(thisWeek - 14 * DAY);
  const acc = new Map<string, Record<string, { ok: number; n: number }>>();
  for (const r of rows) {
    const at = Date.parse(r.at);
    if (!Number.isFinite(at)) continue;
    const w = mondayOf(at);
    if (w !== week && w !== prev) continue;
    const m = acc.get(r.model) ?? {};
    const c = m[w] ?? { ok: 0, n: 0 };
    m[w] = { ok: c.ok + (r.verified ? 1 : 0), n: c.n + 1 };
    acc.set(r.model, m);
  }
  const out: LearnCard[] = [];
  for (const [model, m] of [...acc.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const cur = m[week];
    const old = m[prev];
    if (!cur || !old || cur.n < LEARN_LIMITS.regression_min_week || old.n < LEARN_LIMITS.regression_min_week) continue;
    const share = r3(cur.ok / cur.n);
    const prevShare = r3(old.ok / old.n);
    if (prevShare === 0 || (prevShare - share) / prevShare <= LEARN_LIMITS.regression_drop + 1e-9) continue;
    out.push({ kind: "model_regression", source: "rule:model_regression", model, week, prev_week: prev, share, prev_share: prevShare, tasks: cur.n, prev_tasks: old.n });
  }
  return out;
}
