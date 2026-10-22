import { translate } from "../i18n/t";
import type { Lang } from "../i18n/t";

// D-307: what the workbench screens show. The server fills it from the database (lib/server/workbench.ts); where the
// system does not record something yet, `withSample` puts the labelled sample (lib/sample.ts) in its place.
export type AgentState = "running" | "waiting" | "done" | "failed" | "idle";
export interface FleetRow {
  id: string; parent_id: string | null; task_id: string | null; repo: string | null; agent: string; model: string; account: string | null;
  role: "lead" | "subagent" | "judge" | "research"; state: AgentState; step: string; context_pct: number | null; usd: number; tools: string[]; started_at: string;
}
export interface ToolCallRow { at: string; session_id: string; agent: string; kind: "mcp" | "skill" | "builtin" | "bash" | "mandat"; tool: string; summary: string; decision: "allowed" | "asked" | "denied" | "slow" | "error"; duration_ms: number | null }
export interface McpRow { name: string; transport: "stdio" | "http"; tools: number; status: "up" | "slow" | "down" | "off"; latency_ms: number | null; egress_hosts: string[]; repos: string[] | null; calls_hour: number }
export interface SkillRow { name: string; description: string; source: "repo" | "user" | "team" | "builtin"; version: string | null; used_by: number; blocked_reason?: string | null }
export interface PluginRow { name: string; description: string; kind: "hook" | "command" | "check" | "notify"; enabled: boolean }
export interface PermissionCell { subject: string; tool: string; decision: "allow" | "ask" | "deny" }
export interface WindowRow { id: string; kind: "terminal" | "preview" | "server" | "log"; title: string; url: string | null; status: "live" | "slow" | "idle"; repo: string | null; last_seen_at: string }
export interface NightView {
  shift: { id: string; starts_at: string; ends_at: string; budget_usd: number; spent_usd: number; status: string; rules: { auto_merge: { min_level: number; max_lines: number }; on_fail: string; retries?: number; same_file: string; forbid_tools: string[] } } | null;
  queue: { position: number; repo: string; text: string; risk: "low" | "medium" | "high"; est_minutes: number; est_usd: number; status: string }[];
  last: { starts_at: string; spent_usd: number; budget_usd: number; merged: number; waiting: number; failed: number; items: { text: string; repo: string; status: string }[] } | null;
}
export interface ResearchView {
  questions: { id: string; question: string; status: string; created_at: string; claims: number }[];
  current: { id: string; question: string; status: string; draft: string | null; sources: { n: number; title: string; url: string; state: "read" | "weak" | "failed" }[]; claims: { text: string; verdict: "confirmed" | "single" | "conflict" | "unchecked"; source_ns: number[] }[] } | null;
}
export interface HomeExtras { mcpPerMin: number; denied24h: number; costToday: number; conflicts: { repo: string; path: string; sessions: number }[]; windows: WindowRow[] }

export type Sourced<T> = { data: T; sample: boolean };
/** Real data when there is any; otherwise the sample (if the person keeps samples on), always marked. */
export function withSample<T>(real: T, sample: T, empty: (x: T) => boolean, show: boolean): Sourced<T> {
  return !empty(real) || !show ? { data: real, sample: false } : { data: sample, sample: true };
}

/** Two live sessions in one repo touching one file = a merge conflict waiting to happen (design H1). */
export function conflicts(rows: { repo: string | null; state: AgentState; touching: string[] }[]): { repo: string; path: string; sessions: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) if (r.repo && (r.state === "running" || r.state === "waiting")) for (const p of new Set(r.touching)) m.set(`${r.repo}\u0000${p}`, (m.get(`${r.repo}\u0000${p}`) ?? 0) + 1);
  return [...m].filter(([, n]) => n > 1).map(([k, n]) => { const [repo, path] = k.split("\u0000") as [string, string]; return { repo, path, sessions: n }; }).sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path));
}

/** The session tree: leads first, each followed by its subagents. */
export function tree<T extends { id: string; parent_id: string | null }>(rows: T[]): (T & { depth: number })[] {
  const out: (T & { depth: number })[] = [];
  const kids = (id: string) => rows.filter((r) => r.parent_id === id);
  const walk = (r: T, depth: number) => { out.push({ ...r, depth }); for (const k of kids(r.id)) walk(k, depth + 1); };
  for (const r of rows.filter((x) => x.parent_id === null || !rows.some((y) => y.id === x.parent_id))) walk(r, 0);
  return out;
}

/** The night plan (design H5): each queued task goes to the slot that frees up first; Mandat checks after each. Percent of the window. */
export function nightPlan(queue: { text: string; repo: string; risk: string; est_minutes: number }[], slots: number, windowMinutes: number, judgeMinutes = 8, lang: Lang = "en"): { slot: number; left: number; width: number; label: string; kind: "run" | "judge" | "risk" }[][] {
  const free = Array.from({ length: slots }, () => 0);
  const lanes: ReturnType<typeof nightPlan> = Array.from({ length: slots }, () => []);
  const pct = (m: number) => Math.round((m / windowMinutes) * 1000) / 10;
  for (const q of queue) {
    const slot = free.indexOf(Math.min(...free));
    const start = free[slot] as number;
    if (start + q.est_minutes > windowMinutes) continue;
    lanes[slot]?.push({ slot, left: pct(start), width: pct(q.est_minutes), label: `${q.repo} · ${q.text}`, kind: q.risk === "high" ? "risk" : "run" });
    lanes[slot]?.push({ slot, left: pct(start + q.est_minutes), width: pct(judgeMinutes), label: translate(lang, "brand.judge"), kind: "judge" });
    free[slot] = start + q.est_minutes + judgeMinutes;
  }
  return lanes;
}

/** E7e: the read-only terminal of the card — one line per stream event (already redacted by the worker), ≤ 50 000. */
export interface TerminalLine { seq: number; mark: string; text: string }
const MARK: Record<string, string> = { init: "▶", text: " ", step: "·", tool_call: "$", tool_result: "←", permission: "✕", subagent_start: "┬", subagent_stop: "┴", usage: "Σ", result: "■", unparsed: "?" };
export function terminalLines(rows: { seq: number; kind: string; text: string }[]): TerminalLine[] {
  return rows.slice(0, 50_000).map((r) => ({ seq: r.seq, mark: MARK[r.kind] ?? "?", text: r.text }));
}
