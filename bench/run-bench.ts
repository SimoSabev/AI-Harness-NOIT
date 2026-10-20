import type { VerdictResult } from "@mandat/contract";
import type { DockerRunner } from "@mandat/sandbox";
import { runTask } from "@mandat/worker";
import { SCENARIOS } from "./scenarios.js";

export interface BenchRow {
  id: string;
  fake: string;
  expected: VerdictResult;
  actual: VerdictResult | "ERROR";
  reasons_ok: boolean;
  ms: number;
  mismatch: boolean;
  missing: string[];
  agentExit: number | null;
}
export interface BenchResult {
  rows: BenchRow[];
  pass: number;
  false_verified: number;
  false_failed: number;
  ms: number;
  infraError: string | null;
}

/** 9.6 / D-110 / D-134: sequential, baseline cached after the first run. */
export async function runBench(o: { home: string; contractPath: string; only?: string[]; docker?: DockerRunner; env?: Record<string, string | undefined>; onRow?: (r: BenchRow) => void }): Promise<BenchResult> {
  const rows: BenchRow[] = [];
  const t0 = Date.now();
  let infraError: string | null = null;
  for (const s of SCENARIOS) {
    if (o.only && !o.only.includes(s.id)) continue;
    const t = Date.now();
    const r = await runTask({
      home: o.home, contractPath: o.contractPath, agent: `fake:${s.fake}`, keep: false, json: true,
      ...(o.docker ? { docker: o.docker } : {}), internals: { ...(o.env ? { env: o.env } : {}) },
    });
    if (!r.verdict) {
      infraError = `${r.error?.code ?? "?"}: ${r.error?.message ?? ""}`;
      break;
    }
    const missing = s.reasons.filter((x) => !r.verdict?.reasons.includes(x));
    const actual = r.verdict.result;
    const row: BenchRow = {
      id: s.id, fake: s.fake, expected: s.expected, actual, reasons_ok: missing.length === 0, ms: Date.now() - t,
      mismatch: actual !== s.expected || missing.length > 0 || r.agentExit === 3 || r.verdict.reasons.some((x) => x.startsWith("infra:")),
      missing, agentExit: r.agentExit,
    };
    rows.push(row);
    o.onRow?.(row);
  }
  return {
    rows,
    pass: rows.filter((r) => !r.mismatch).length,
    false_verified: rows.filter((r) => r.actual === "VERIFIED" && r.expected !== "VERIFIED").length,
    false_failed: rows.filter((r) => r.actual === "FAILED" && r.expected !== "FAILED").length,
    ms: Date.now() - t0,
    infraError,
  };
}

export const fmtDuration = (ms: number): string => `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s`;
