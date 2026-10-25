import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { printJson } from "../output.js";
import type { Io } from "../output.js";

// Calibration of the judge on real runs (runs/*/verdict.json): how often it asks a human, why, and what a task costs.
// Fake agents (bench, red team) are left out unless asked: they say nothing about real work.
const Row = z.object({
  result: z.enum(["VERIFIED", "UNKNOWN", "FAILED"]),
  reasons: z.array(z.string()),
  agent: z.string(),
  usage: z.object({ usd: z.number() }).partial().optional(),
  timings_ms: z.object({ total: z.number() }).partial().optional(),
  created_at: z.string(),
});
type Row = z.infer<typeof Row>;
type Result = Row["result"];

export interface Stats {
  total: number;
  byResult: Record<Result, number>;
  unknownShare: number;
  topReasons: { cls: string; n: number }[];
  meanUsd: number;
  meanMinutes: number;
  byAgent: Record<string, { total: number } & Record<Result, number>>;
}

export function readVerdicts(home: string, sinceMs?: number): Row[] {
  const dir = path.join(home, "runs");
  if (!existsSync(dir)) return [];
  const out: Row[] = [];
  for (const id of readdirSync(dir)) {
    const f = path.join(dir, id, "verdict.json");
    if (!existsSync(f)) continue;
    try {
      const r = Row.safeParse(JSON.parse(readFileSync(f, "utf8")));
      if (r.success && (sinceMs === undefined || Date.parse(r.data.created_at) >= sinceMs)) out.push(r.data);
    } catch {
      /* a broken file is not a run */
    }
  }
  return out;
}

const isFake = (agent: string) => agent.startsWith("fake:") || agent.startsWith("fake-codex:");

export function runStats(rows: Row[], o: { includeFakes: boolean }): Stats {
  const rs = o.includeFakes ? rows : rows.filter((r) => !isFake(r.agent));
  const byResult: Record<Result, number> = { VERIFIED: 0, UNKNOWN: 0, FAILED: 0 };
  const reasons = new Map<string, number>();
  const byAgent: Stats["byAgent"] = {};
  for (const r of rs) {
    byResult[r.result]++;
    const a = (byAgent[r.agent] ??= { total: 0, VERIFIED: 0, UNKNOWN: 0, FAILED: 0 });
    a.total++;
    a[r.result]++;
    // one count per class per run (D11:survived on two lines is one reason to look)
    for (const c of new Set(r.reasons.map((x) => x.split(":").slice(0, 2).join(":")))) reasons.set(c, (reasons.get(c) ?? 0) + 1);
  }
  const n = rs.length;
  const mean = (f: (r: Row) => number) => (n === 0 ? 0 : rs.reduce((s, r) => s + f(r), 0) / n);
  return {
    total: n,
    byResult,
    unknownShare: n === 0 ? 0 : byResult.UNKNOWN / n,
    topReasons: [...reasons.entries()].map(([cls, k]) => ({ cls, n: k })).sort((a, b) => b.n - a.n || a.cls.localeCompare(b.cls)).slice(0, 10),
    meanUsd: mean((r) => r.usage?.usd ?? 0),
    meanMinutes: mean((r) => (r.timings_ms?.total ?? 0) / 60_000),
    byAgent,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
export function formatStats(s: Stats): string {
  if (s.total === 0) return "no real runs yet (fake agents are left out; --all counts them)\n";
  const lines = [
    `runs ${s.total} · VERIFIED ${s.byResult.VERIFIED} · UNKNOWN ${s.byResult.UNKNOWN} (${pct(s.unknownShare)}) · FAILED ${s.byResult.FAILED}`,
    `mean $${s.meanUsd.toFixed(2)} · ${s.meanMinutes.toFixed(1)} min per task`,
    "top reasons:",
    ...s.topReasons.map((r) => `  ${String(r.n).padStart(3)}  ${r.cls}`),
    "by agent:",
    ...Object.entries(s.byAgent).map(([a, x]) => `  ${a}: ${x.total} (V ${x.VERIFIED} · U ${x.UNKNOWN} · F ${x.FAILED})`),
  ];
  if (s.unknownShare > 0.4) lines.push("advice: UNKNOWN is over 40% — the judge asks a human too often; look at the top reasons before adding checks");
  return lines.join("\n") + "\n";
}

export function statsCommand(io: Io, o: { mandatHome: string; json: boolean; all: boolean; sinceDays?: number }): number {
  const since = o.sinceDays === undefined ? undefined : Date.now() - o.sinceDays * 86_400_000;
  const s = runStats(readVerdicts(o.mandatHome, since), { includeFakes: o.all });
  if (o.json) printJson(io, s);
  else io.stdout(formatStats(s));
  return 0;
}
