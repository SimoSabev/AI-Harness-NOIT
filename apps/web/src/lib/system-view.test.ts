import { describe, expect, it } from "vitest";
import type { JobState } from "@mandat/contract";
import { doctorRows, jobBadge, ledgerSummary, statsSummary } from "./system-view";

// D-370: what the System page shows for each job and its --json result.
const st = (o: Partial<JobState>): JobState => ({ job: "doctor", state: "idle", started_at: null, finished_at: null, exit: null, lines: [], result: null, ...o });

describe("system view (D-370)", () => {
  it("the badge of a job", () => {
    expect(jobBadge(st({}))).toEqual({ tone: "gray", label: "system.state.idle" });
    expect(jobBadge(st({ state: "running" }))).toEqual({ tone: "amber", label: "system.state.running" });
    expect(jobBadge(st({ state: "ok" }))).toEqual({ tone: "green", label: "system.state.ok" });
    expect(jobBadge(st({ state: "failed" }))).toEqual({ tone: "red", label: "system.state.failed" });
  });
  it("doctor: the checks; anything else → null", () => {
    expect(doctorRows({ checks: [{ name: "node", ok: false, detail: "26.4.0" }], exit: 3 })).toEqual([{ name: "node", ok: false, detail: "26.4.0" }]);
    expect(doctorRows(null)).toBeNull();
    expect(doctorRows({ checks: "x" })).toBeNull();
  });
  it("stats: totals, UNKNOWN share in %, mean minutes rounded, top reasons", () => {
    expect(statsSummary({ total: 4, byResult: { VERIFIED: 3, UNKNOWN: 1, FAILED: 0 }, unknownShare: 0.25, topReasons: [{ cls: "INFRA", n: 1 }], meanUsd: 0.1234, meanMinutes: 2.456, byAgent: {} })).toEqual({ total: 4, verified: 3, unknown: 1, failed: 0, unknownPct: 25, minutes: 2.5, usd: 0.12, reasons: [{ cls: "INFRA", n: 1 }] });
    expect(statsSummary({ total: "x" })).toBeNull();
  });
  it("ledger: intact with a count, or broken at a seq", () => {
    expect(ledgerSummary({ ok: true, count: 12 })).toEqual({ ok: true, count: 12, badSeq: null });
    expect(ledgerSummary({ ok: false, countOk: 4, firstBadSeq: 5, code: "hash_mismatch" })).toEqual({ ok: false, count: null, badSeq: 5 });
    expect(ledgerSummary(undefined)).toBeNull();
  });
});
