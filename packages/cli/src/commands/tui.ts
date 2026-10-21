import { spawn } from "node:child_process";
import { openDb } from "@mandat/worker";
import type { Io } from "../output.js";
import { localDbUrl } from "./local.js";

// D-306: `mandat tui` — the start page in the terminal (design 13/H7): the flow, the swarm, one pane per project, the keys.
// Read-only: decisions stay in the web UI (they may need the second factor). The column is public.board_column (one truth with the UI).
export interface TuiRow { id: string; repo: string; text: string; agent: string; col: number; last_result: string | null; updated_at: string }
type Health = "bad" | "warn" | "ok" | "idle";
export interface TuiModel {
  flow: { queued: number; running: number; checking: number; you: number; done24h: number };
  swarm: { col: number }[];
  panes: { name: string; full: string; health: Health; lines: { id: string; text: string; agent: string; col: number; result: string | null }[]; done24h: number }[];
}

const DAY = 24 * 3600_000;
const RANK: Record<number, number> = { 5: 0, 4: 1, 2: 2, 3: 2, 1: 3 };
const ORDER: Record<Health, number> = { bad: 0, warn: 1, ok: 2, idle: 3 };

export function tuiModel(rows: TuiRow[], now: Date = new Date()): TuiModel {
  const fresh = (r: TuiRow) => now.getTime() - Date.parse(r.updated_at) <= DAY;
  const flow = { queued: 0, running: 0, checking: 0, you: 0, done24h: 0 };
  for (const r of rows) {
    if (r.col === 1) flow.queued++;
    else if (r.col === 2) flow.running++;
    else if (r.col === 3) flow.checking++;
    else if (r.col === 4 || r.col === 5) flow.you++;
    else if (fresh(r)) flow.done24h++;
  }
  const repos = [...new Set(rows.map((r) => r.repo))];
  const panes = repos.map((repo) => {
    const mine = rows.filter((r) => r.repo === repo);
    const live = mine.filter((r) => r.col <= 5).sort((a, b) => (RANK[a.col] ?? 9) - (RANK[b.col] ?? 9) || (a.updated_at < b.updated_at ? 1 : -1));
    const health: Health = live.some((r) => r.col === 5) ? "bad" : live.some((r) => r.col === 4) ? "warn" : live.length > 0 ? "ok" : "idle";
    return { name: repo.split("/").pop() ?? repo, full: repo, health, done24h: mine.filter((r) => r.col > 5 && fresh(r)).length, lines: live.map((r) => ({ id: r.id, text: r.text, agent: r.agent, col: r.col, result: r.last_result })) };
  }).sort((a, b) => ORDER[a.health] - ORDER[b.health] || a.name.localeCompare(b.name));
  const swarm = rows.filter((r) => r.col <= 5).map((r) => ({ col: r.col })).sort((a, b) => (RANK[a.col] ?? 9) - (RANK[b.col] ?? 9));
  return { flow, swarm, panes };
}

// the dark theme tokens (globals.css), muted
const C = { ink: [223, 230, 224], mute: [152, 164, 156], accent: [166, 194, 94], warn: [217, 180, 106], bad: [227, 139, 129], info: [143, 197, 181], idle: [111, 123, 115], bar: [26, 34, 18] } as const;
type Rgb = readonly [number, number, number];
const ESC = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
export const visibleWidth = (s: string): number => [...s.replace(ESC, "")].length;
function fit(s: string, w: number): string {
  const cps = [...s];
  return cps.length > w ? cps.slice(0, Math.max(0, w - 1)).join("") + "…" : s + " ".repeat(w - cps.length);
}

export function renderTui(m: TuiModel, o: { width: number; height: number; color: boolean; focus: number }): string {
  const fg = (c: Rgb, s: string) => (o.color ? `\u001b[38;2;${c[0]};${c[1]};${c[2]}m${s}\u001b[0m` : s);
  const inv = (s: string) => (o.color ? `\u001b[48;2;${C.accent[0]};${C.accent[1]};${C.accent[2]}m\u001b[38;2;18;24;7m${s}\u001b[0m` : s);
  const W = Math.max(40, o.width);
  const out: string[] = [];
  const arrow = (c: Rgb) => fg(c, " ━▶ ");
  const flowPlain = `задачи ${m.flow.queued} ━▶ агенти ${m.flow.running} ━▶ мандат ${m.flow.checking} ━▶ ти ${m.flow.you} ━▶ готово ${m.flow.done24h}`;
  out.push(visibleWidth(flowPlain) <= W ? `${fg(C.mute, "задачи")} ${fg(C.ink, String(m.flow.queued))}${arrow(C.accent)}${fg(C.mute, "агенти")} ${fg(C.accent, String(m.flow.running))}${arrow(C.accent)}${fg(C.mute, "мандат")} ${fg(C.info, String(m.flow.checking))}${arrow(C.warn)}${fg(C.warn, `ти ${m.flow.you}`)}${arrow(C.idle)}${fg(C.mute, "готово")} ${fg(C.ink, String(m.flow.done24h))}` : fit(flowPlain, W));
  const tone = (col: number): Rgb => (col === 5 ? C.bad : col === 4 ? C.warn : col === 3 ? C.info : col === 2 ? C.accent : C.idle);
  const hexes = m.swarm.slice(0, Math.max(0, W - 2)).map((s) => fg(tone(s.col), "⬢")).join("");
  out.push(m.swarm.length ? hexes : fg(C.mute, "няма живи агенти"));
  out.push(fg(C.idle, "─".repeat(W)));
  if (m.panes.length === 0) {
    out.push(fg(C.ink, "Още няма задачи."), fg(C.mute, "Дай задача в браузъра (http://localhost:3000/tasks/new) или с mandat run."));
  } else {
    const cols = Math.min(m.panes.length, W >= 120 ? 3 : W >= 80 ? 2 : 1);
    const pw = Math.floor((W - (cols - 1)) / cols);
    const bodyH = Math.max(3, Math.floor((o.height - out.length - 2) / Math.ceil(Math.min(m.panes.length, cols * 2) / cols)) - 1);
    const STATE: Record<number, string> = { 1: "опашка", 2: "работи", 3: "мандат", 4: "ЧАКА ТЕБ", 5: "ПРОВАЛ" };
    const blocks = m.panes.slice(0, cols * 2).map((p, i) => {
      const head = fit(` [${i + 1}] ${p.name} · ${p.health === "bad" ? "ПРОВАЛ" : p.health === "warn" ? "чака теб" : p.health === "ok" ? "върви" : "тихо"} `, pw);
      const lines = [i === o.focus ? inv(head) : fg(p.health === "bad" ? C.bad : p.health === "warn" ? C.warn : C.accent, head)];
      for (const l of p.lines.slice(0, bodyH - 1)) {
        const st = STATE[l.col] ?? "";
        const left = fit(` ⬢ ${l.text}`, Math.max(4, pw - 10));
        lines.push(`${fg(tone(l.col), left.slice(0, 3))}${fg(C.ink, left.slice(3))}${fg(tone(l.col), fit(` ${st}`, pw - visibleWidth(left)))}`);
      }
      lines.push(fg(C.mute, fit(` ${p.done24h} готови за 24 ч`, pw)));
      while (lines.length < bodyH + 1) lines.push(" ".repeat(pw));
      return lines;
    });
    for (let r = 0; r < blocks.length; r += cols) {
      const row = blocks.slice(r, r + cols);
      const h = Math.max(...row.map((b) => b.length));
      for (let k = 0; k < h; k++) out.push(row.map((b) => b[k] ?? " ".repeat(pw)).join(fg(C.idle, "│")));
    }
  }
  const keys = " 1-6 панел · tab следващ · o браузър · r обнови · q изход";
  while (out.length < o.height - 1) out.push("");
  out.length = Math.min(out.length, o.height - 1);
  out.push(o.color ? inv(fit(keys, W)) : fit(keys, W).trimEnd());
  return out.map((l) => (visibleWidth(l) > W ? fit(l.replace(ESC, ""), W) : l)).join("\n");
}

function openUrl(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => undefined).unref();
}

const SQL = `
select t.id, r.full_name as repo, t.text, t.agent, t.last_result,
       public.board_column(t.state, t.last_result, t.wait_reason, coalesce(c.approval_needed, false), t.outcome_decided)::int as col,
       to_char(t.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
  from public.tasks t join public.repos r on r.id = t.repo_id
  left join lateral (select x.approval_needed from public.changesets x where x.task_id = t.id order by x.attempt desc, x.created_at desc limit 1) c on true
 where t.updated_at > now() - interval '7 days' or t.state not in ('CLOSED', 'OUTCOME', 'DELIVERED')
 order by t.updated_at desc limit 500`;

export async function tuiCommand(io: Io, o: { dbPort: number; once: boolean; width?: number; height?: number }): Promise<number> {
  const db = openDb(io.env.MANDAT_DB_URL ?? localDbUrl(o.dbPort));
  const color = io.env.NO_COLOR === undefined && !o.once;
  const size = () => ({ width: o.width ?? process.stdout.columns ?? 100, height: o.height ?? process.stdout.rows ?? 30 });
  let focus = 0;
  let model: TuiModel;
  const load = async () => { model = tuiModel((await db.query<TuiRow>(SQL)).rows); };
  try {
    await load();
  } catch {
    io.stderr("tui: базата не отговаря. Пусни първо `pnpm local`.\n");
    await db.end().catch(() => undefined);
    return 3;
  }
  const draw = () => renderTui(model, { ...size(), color, focus });
  if (o.once || !process.stdin.isTTY) {
    io.stdout(draw() + "\n");
    await db.end();
    return 0;
  }
  process.stdout.write("\u001b[?1049h\u001b[?25l");
  const paint = () => process.stdout.write("\u001b[H\u001b[2J" + draw());
  paint();
  const timer = setInterval(() => void load().then(paint).catch(() => undefined), 2000);
  process.stdout.on("resize", paint);
  return new Promise<number>((resolve) => {
    const done = () => {
      clearInterval(timer);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\u001b[?25h\u001b[?1049l");
      void db.end().then(() => resolve(0));
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (b: Buffer) => {
      const k = b.toString("utf8");
      if (k === "q" || k === "\u0003") return done();
      if (k === "\t") focus = (focus + 1) % Math.max(1, Math.min(6, model.panes.length));
      else if (/^[1-6]$/.test(k)) focus = Math.min(Number(k) - 1, Math.max(0, model.panes.length - 1));
      else if (k === "r") void load().then(paint);
      else if (k === "o") openUrl(`http://localhost:3000/?project=${encodeURIComponent(model.panes[focus]?.full ?? "")}`);
      paint();
    });
  });
}
