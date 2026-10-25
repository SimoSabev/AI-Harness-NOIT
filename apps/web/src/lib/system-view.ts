import { DoctorReport, LedgerReport, StatsReport } from "@mandat/contract";
import type { JobState } from "@mandat/contract";
import type { Key } from "../i18n/t";

// D-370: the System page — the badge of a job and the parts of the --json results it shows.
export function jobBadge(s: JobState): { tone: "gray" | "amber" | "green" | "red"; label: Key } {
  const tone = { idle: "gray", running: "amber", ok: "green", failed: "red" } as const;
  return { tone: tone[s.state], label: `system.state.${s.state}` };
}

export function doctorRows(result: unknown): { name: string; ok: boolean; detail: string }[] | null {
  const r = DoctorReport.safeParse(result);
  return r.success ? r.data.checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail })) : null;
}

export function statsSummary(result: unknown) {
  const r = StatsReport.safeParse(result);
  if (!r.success) return null;
  const s = r.data;
  return {
    total: s.total,
    verified: s.byResult.VERIFIED,
    unknown: s.byResult.UNKNOWN,
    failed: s.byResult.FAILED,
    unknownPct: Math.round(s.unknownShare * 100),
    minutes: Math.round(s.meanMinutes * 10) / 10,
    usd: Math.round(s.meanUsd * 100) / 100,
    reasons: s.topReasons,
  };
}

export function ledgerSummary(result: unknown): { ok: boolean; count: number | null; badSeq: number | null } | null {
  const r = LedgerReport.safeParse(result);
  return r.success ? { ok: r.data.ok, count: r.data.ok ? (r.data.count ?? 0) : null, badSeq: r.data.ok ? null : (r.data.firstBadSeq ?? null) } : null;
}
