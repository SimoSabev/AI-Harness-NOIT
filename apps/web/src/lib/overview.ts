import { LOCALE, plural, translate } from "../i18n/t";
import type { Lang } from "../i18n/t";
import { groupOf, statusOf } from "./status";
import type { Status, Tone } from "./status";

// D-305: the start page in numbers — the flow (where every task is now), one summary per project, the swarm of
// live agents, and the rhythm of a project (7 days × 2 h). Pure, so the views stay thin.
export interface OverviewTask {
  id: string; repo_id: string; text: string; agent: string; state: string; last_result: "VERIFIED" | "FAILED" | "UNKNOWN" | null;
  wait_reason: string | null; approval_needed: boolean; approved_by_human: boolean; updated_at: string;
}
export type Health = "bad" | "warn" | "ok" | "idle";
export interface Flow { queued: number; running: number; checking: number; waiting: number; done24h: number }
export interface ProjectSummary<T> { id: string; name: string; full_name: string; health: Health; word: string; waiting: number; active: number; done24h: number; items: (T & { status: Status })[] }
export interface Overview<T> { flow: Flow; projects: ProjectSummary<T>[]; swarm: { id: string; repo_id: string; tone: Tone; label: string }[] }

const ORDER: Record<Health, number> = { bad: 0, warn: 1, ok: 2, idle: 3 };
const RANK: Record<string, number> = { failed: 0, key: 0, unknown: 1, empty: 1, review: 2, running: 3, checking: 3, queued: 4 };
const DAY = 24 * 3600_000;

function word(lang: Lang, h: Health, bad: number, waiting: number, active: number): string {
  if (h === "bad") return translate(lang, "overview.word.bad", { n: bad });
  if (h === "warn") return plural(lang, "inbox.waitingYou", waiting);
  if (h === "ok") return plural(lang, "overview.word.ok", active);
  return translate(lang, "overview.word.idle");
}

export function overview<T extends OverviewTask>(tasks: T[], repos: { id: string; full_name: string }[], now: Date = new Date(), lang: Lang = "en"): Overview<T> {
  const flow: Flow = { queued: 0, running: 0, checking: 0, waiting: 0, done24h: 0 };
  const rows = tasks.map((t) => ({ ...t, status: statusOf(t, lang) }));
  for (const r of rows) {
    const k = r.status.key;
    const g = groupOf(k);
    if (k === "queued") flow.queued++;
    else if (k === "running") flow.running++;
    else if (k === "checking") flow.checking++;
    else if (g === "waiting") flow.waiting++;
    else if (now.getTime() - Date.parse(r.updated_at) <= DAY) flow.done24h++;
  }
  const known = new Set(repos.map((r) => r.id));
  const all = [...repos];
  if (rows.some((r) => !known.has(r.repo_id))) all.push({ id: "", full_name: translate(lang, "overview.other") });
  const projects = all.map((repo) => {
    const mine = rows.filter((r) => (repo.id === "" ? !known.has(r.repo_id) : r.repo_id === repo.id));
    const bad = mine.filter((r) => r.status.key === "failed" || r.status.key === "key").length;
    const waiting = mine.filter((r) => groupOf(r.status.key) === "waiting").length;
    const active = mine.filter((r) => groupOf(r.status.key) === "active").length;
    const done24h = mine.filter((r) => groupOf(r.status.key) === "done" && now.getTime() - Date.parse(r.updated_at) <= DAY).length;
    const health: Health = bad > 0 ? "bad" : waiting > 0 ? "warn" : active > 0 ? "ok" : "idle";
    const items = mine.filter((r) => groupOf(r.status.key) !== "done").sort((a, b) => (RANK[a.status.key] ?? 9) - (RANK[b.status.key] ?? 9) || (a.updated_at < b.updated_at ? 1 : -1));
    const name = repo.full_name.includes("/") ? (repo.full_name.split("/").pop() as string) : repo.full_name;
    return { id: repo.id, name, full_name: repo.full_name, health, word: word(lang, health, bad, waiting, active), waiting, active, done24h, items };
  }).sort((a, b) => ORDER[a.health] - ORDER[b.health] || a.name.localeCompare(b.name));
  const swarm = rows.filter((r) => groupOf(r.status.key) !== "done").sort((a, b) => (RANK[a.status.key] ?? 9) - (RANK[b.status.key] ?? 9) || a.id.localeCompare(b.id))
    .map((r) => ({ id: r.id, repo_id: r.repo_id, tone: r.status.tone, label: r.status.label }));
  return { flow, projects: projects.filter((p) => p.id !== "" || p.items.length + p.done24h > 0), swarm };
}

/** 7 rows (oldest first, today last) × 12 two-hour cells (UTC): finished tasks and failures. */
export function rhythm(tasks: OverviewTask[], now: Date = new Date(), lang: Lang = "en"): { day: string; cells: { done: number; bad: number }[] }[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Array.from({ length: 7 }, (_, i) => ({ start: today - (6 - i) * DAY, cells: Array.from({ length: 12 }, () => ({ done: 0, bad: 0 })) }));
  for (const t of tasks) {
    const at = Date.parse(t.updated_at);
    const d = days.find((x) => at >= x.start && at < x.start + DAY);
    if (!d) continue;
    const cell = d.cells[Math.floor((at - d.start) / (2 * 3600_000))];
    if (!cell) continue;
    const k = statusOf(t).key;
    if (k === "failed" || k === "key") cell.bad++;
    else if (groupOf(k) === "done") cell.done++;
  }
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { weekday: "short", timeZone: "UTC" });
  return days.map((d, i) => ({ day: i === 6 ? translate(lang, "overview.today") : fmt.format(new Date(d.start)), cells: d.cells }));
}
