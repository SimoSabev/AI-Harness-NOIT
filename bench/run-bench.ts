import { demoProfileLayers, parseVitestReport, sealProfile } from "@mandat/contract";
import type { ProfileLayersInput } from "@mandat/contract";
import type { VerdictResult } from "@mandat/contract";
import type { DockerRunner } from "@mandat/sandbox";
import { runTask, runTestProcedure } from "@mandat/worker";
import { CHECKS, HELDOUT, HIDDEN, SCENARIOS } from "./scenarios.js";

/** v5 E9b (D8): the demo profile (or the profile under trial, D-530) with the shop's own lint and typecheck */
function checksProfile(base?: ProfileLayersInput) {
  const l = base ?? demoProfileLayers();
  return sealProfile({ version: 1, repo_id: "local", layers: { ...l, b: { ...l.b, commands: { ...l.b.commands, ...CHECKS } } }, sources: {}, approved_by: null, approved_at: null });
}
/** D-530: the profile under trial, for every scenario */
const trialProfile = (layers: ProfileLayersInput) => sealProfile({ version: 1, repo_id: "local", layers, sources: {}, approved_by: null, approved_at: null });

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
export async function runBench(o: {
  home: string; contractPath: string; freeContractPath?: string; only?: string[]; docker?: DockerRunner; env?: Record<string, string | undefined>; onRow?: (r: BenchRow) => void;
  /** D-530: the profile under trial (every scenario runs with it) */
  layers?: ProfileLayersInput;
  /** D-530: only the scenarios of one contract — "free" for free tasks, "default" (bugfix) for the other types */
  kind?: "free" | "default";
  /** D-550: "heldout" runs only the held-out heavy set (the second gate of a trial); default: the visible scenarios */
  set?: "visible" | "heldout";
  /** tests only: the task runner */
  run?: typeof runTask;
}): Promise<BenchResult> {
  const rows: BenchRow[] = [];
  const t0 = Date.now();
  let infraError: string | null = null;
  const run = o.run ?? runTask;
  for (const s of o.set === "heldout" ? HELDOUT : SCENARIOS) {
    if (o.only && !o.only.includes(s.id)) continue;
    if (o.kind && (o.kind === "free") !== (s.contract === "free")) continue;
    const t = Date.now();
    if (s.contract === "free" && !o.freeContractPath) {
      infraError = `${s.id}: no free contract`;
      break;
    }
    const profile = s.checks ? checksProfile(o.layers) : o.layers ? trialProfile(o.layers) : null;
    const r = await run({
      home: o.home, contractPath: s.contract === "free" ? (o.freeContractPath as string) : o.contractPath, agent: `fake:${s.fake}`, keep: false, json: true,
      ...(s.hidden ? { hidden: HIDDEN } : {}), ...(profile ? { profile } : {}),
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

export interface FailGateResult {
  result: VerdictResult | "ERROR";
  reasons: string[];
  detected: boolean;
  error: string | null;
}

/**
 * T3-3 / D-223: B1 (honest-fix) with a broken verifier — the report of run A is dropped before D1. The verdict must
 * not be VERIFIED; `detected` = the verifier fault showed up as D1:report_invalid:missing.
 */
export async function runFailGate(o: { home: string; contractPath: string; docker?: DockerRunner; env?: Record<string, string | undefined>; runTests?: typeof runTestProcedure }): Promise<FailGateResult> {
  const real = o.runTests ?? runTestProcedure;
  const broken: typeof runTestProcedure = async (i) => {
    const r = await real(i);
    if (i.tree !== "a" || !r.ok) return r;
    return { ...r, raw: null, report: parseVitestReport(null, "/m/work") };
  };
  const r = await runTask({
    home: o.home, contractPath: o.contractPath, agent: "fake:honest-fix", keep: false, json: true,
    ...(o.docker ? { docker: o.docker } : {}), internals: { ...(o.env ? { env: o.env } : {}), runTests: broken },
  });
  if (!r.verdict) return { result: "ERROR", reasons: [], detected: false, error: `${r.error?.code ?? "?"}: ${r.error?.message ?? ""}` };
  return { result: r.verdict.result, reasons: r.verdict.reasons, detected: r.verdict.result !== "VERIFIED" && r.verdict.reasons.includes("D1:report_invalid:missing"), error: null };
}
