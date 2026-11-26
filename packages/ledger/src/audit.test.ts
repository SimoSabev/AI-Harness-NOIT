import { describe, expect, it } from "vitest";
import { jcs, sha256Tag } from "@mandat/contract";
import type { AuditExport, AuditVerdict } from "@mandat/contract";
import { buildAuditExport, verifyAuditExport } from "./audit.js";
import type { OnlineLedgerRow } from "./online.js";

// E10 hosted (D-704): the export carries the whole chain (hashes) and only the selection's payloads.
const ORG = "00000000-0000-4000-8000-000000000001";
const VH = sha256Tag("verdict-a");
function chain(entries: { kind: string; task: string | null; payload: unknown; ts?: string }[]): OnlineLedgerRow[] {
  const rows: OnlineLedgerRow[] = [];
  for (const e of entries) {
    const prev = rows.at(-1);
    const text = e.payload === null ? null : jcs(e.payload);
    const body = { org_id: ORG, seq: rows.length + 1, ts: e.ts ?? "2026-11-20T10:00:00.000Z", kind: e.kind, task_id: e.task, payload_hash: text === null ? null : sha256Tag(text), prev_hash: prev?.hash ?? null };
    rows.push({ ...body, seq: String(body.seq), payload_jcs: text, hash: sha256Tag(jcs(body)) });
  }
  return rows;
}
const rows = chain([
  { kind: "task_created", task: "t_a", payload: { text: "fix a" } },
  { kind: "task_created", task: "t_b", payload: { text: "secret plan of b" } },
  { kind: "verdict", task: "t_a", payload: { run_id: "r_1", result: "VERIFIED", verdict_hash: VH }, ts: "2026-11-21T10:00:00.000Z" },
  { kind: "approval", task: "t_b", payload: { decision: "approved" }, ts: "2026-11-25T10:00:00.000Z" },
  { kind: "role_change", task: null, payload: { user: "u" }, ts: "2026-11-25T11:00:00.000Z" },
]);
const verdict: AuditVerdict = { task_id: "t_a", run_id: "r_1", attempt: 1, result: "VERIFIED", verdict_hash: VH, created_at: "2026-11-21T10:00:00.000Z" };
const records = { tasks: [{ id: "t_a", state: "CLOSED" }], verdicts: [verdict], approvals: [] };
const NOW = "2026-11-26T10:00:00.000Z";
const byTask = (): AuditExport => buildAuditExport({ org: ORG, selection: { task: "t_a" }, rows, records, generatedAt: NOW, generatedBy: "cli" });
const clone = (x: AuditExport): AuditExport => JSON.parse(JSON.stringify(x)) as AuditExport;

describe("buildAuditExport (D-704)", () => {
  it("by task: the whole chain, payloads only of the task's rows", () => {
    const x = byTask();
    expect(x.ledger.map((r) => [r.seq, r.included])).toEqual([[1, true], [2, false], [3, true], [4, false], [5, false]]);
    expect(x.ledger[1]?.payload_jcs).toBeNull();
    expect(x.ledger[1]?.payload_hash).toBe(rows[1]?.payload_hash);
    expect(JSON.stringify(x)).not.toContain("secret plan of b");
  });
  it("by period: rows with ts in [from, to)", () => {
    const x = buildAuditExport({ org: ORG, selection: { from: "2026-11-25T00:00:00.000Z", to: "2026-11-25T10:30:00.000Z" }, rows, records: { tasks: [], verdicts: [], approvals: [] }, generatedAt: NOW, generatedBy: "cli" });
    expect(x.ledger.filter((r) => r.included).map((r) => r.seq)).toEqual([4]);
  });
  it("refuses rows of another org (an export is one org)", () => {
    expect(() => buildAuditExport({ org: "00000000-0000-4000-8000-000000000002", selection: { task: "t_a" }, rows, records, generatedAt: NOW, generatedBy: "cli" })).toThrow(/org/);
  });
});

describe("verifyAuditExport (D-704)", () => {
  it("an honest export verifies: chain, included payloads, the verdict anchored in the ledger", () => {
    expect(verifyAuditExport(byTask())).toEqual({ ok: true, count: 5, included: 2, verdicts: 1, lastHash: rows[4]?.hash });
  });
  it("an empty org exports and verifies", () => {
    const x = buildAuditExport({ org: ORG, selection: { task: "t_a" }, rows: [], records: { tasks: [], verdicts: [], approvals: [] }, generatedAt: NOW, generatedBy: "cli" });
    expect(verifyAuditExport(x)).toEqual({ ok: true, count: 0, included: 0, verdicts: 0, lastHash: null });
  });
  it("not the format → E_SCHEMA", () => {
    expect(verifyAuditExport({ format: "x" })).toMatchObject({ ok: false, code: "E_SCHEMA" });
  });
  it("a changed payload → E_PAYLOAD at its seq", () => {
    const x = clone(byTask());
    (x.ledger[2] as { payload_jcs: string }).payload_jcs = jcs({ run_id: "r_1", result: "FAILED", verdict_hash: VH });
    expect(verifyAuditExport(x)).toMatchObject({ ok: false, code: "E_PAYLOAD", firstBadSeq: 3 });
  });
  it("a removed row, a changed ts or kind → the chain breaks", () => {
    const gap = clone(byTask());
    gap.ledger.splice(1, 1);
    expect(verifyAuditExport(gap)).toMatchObject({ ok: false, code: "E_SEQ_GAP" });
    const ts = clone(byTask());
    (ts.ledger[0] as { ts: string }).ts = "2026-11-19T10:00:00.000Z";
    expect(verifyAuditExport(ts)).toMatchObject({ ok: false, code: "E_HASH", firstBadSeq: 1 });
  });
  it("a selected row hidden, or a row outside the selection shown → E_SELECTION", () => {
    const hidden = clone(byTask());
    Object.assign(hidden.ledger[2] as object, { included: false, payload_jcs: null });
    expect(verifyAuditExport(hidden)).toMatchObject({ ok: false, code: "E_SELECTION", firstBadSeq: 3 });
    const extra = clone(byTask());
    Object.assign(extra.ledger[1] as object, { included: true, payload_jcs: rows[1]?.payload_jcs });
    expect(verifyAuditExport(extra)).toMatchObject({ ok: false, code: "E_SELECTION", firstBadSeq: 2 });
    const leak = clone(byTask());
    Object.assign(leak.ledger[1] as object, { payload_jcs: rows[1]?.payload_jcs });
    expect(verifyAuditExport(leak)).toMatchObject({ ok: false, code: "E_SELECTION", firstBadSeq: 2 });
  });
  it("an included row without payload verifies only when it never had one; a non-canonical or non-JSON payload → E_PAYLOAD", () => {
    const nil = chain([{ kind: "task_stopped", task: "t_a", payload: null }]);
    expect(verifyAuditExport(buildAuditExport({ org: ORG, selection: { task: "t_a" }, rows: nil, records: { tasks: [], verdicts: [], approvals: [] }, generatedAt: NOW, generatedBy: "cli" }))).toMatchObject({ ok: true, included: 1 });
    const missing = clone(byTask());
    (missing.ledger[0] as { payload_jcs: string | null }).payload_jcs = null;
    expect(verifyAuditExport(missing)).toMatchObject({ ok: false, code: "E_PAYLOAD", message: "payload missing" });
    const spaced = chain([{ kind: "task_created", task: "t_a", payload: { a: 1 } }]);
    const sp = buildAuditExport({ org: ORG, selection: { task: "t_a" }, rows: spaced, records: { tasks: [], verdicts: [], approvals: [] }, generatedAt: NOW, generatedBy: "cli" });
    const text = '{ "a": 1 }';
    const notJson = "{a:1}";
    for (const [t, msg] of [[text, "payload_jcs is not canonical (JCS)"], [notJson, "payload is not JSON"]] as const) {
      // a row whose recorded hash is of a non-canonical text: rebuild the chain around it
      const body = { org_id: ORG, seq: 1, ts: sp.ledger[0]?.ts ?? "", kind: "task_created", task_id: "t_a", payload_hash: sha256Tag(t), prev_hash: null };
      const y = clone(sp);
      Object.assign(y.ledger[0] as object, { payload_jcs: t, payload_hash: body.payload_hash, hash: sha256Tag(jcs(body)) });
      expect(verifyAuditExport(y)).toMatchObject({ ok: false, code: "E_PAYLOAD", message: msg });
    }
  });
  it("a verdict record the ledger does not name → E_UNANCHORED", () => {
    const x = clone(byTask());
    (x.records.verdicts[0] as { result: string; verdict_hash: string }).verdict_hash = sha256Tag("other");
    expect(verifyAuditExport(x)).toMatchObject({ ok: false, code: "E_UNANCHORED" });
    const y = clone(byTask());
    (y.records.verdicts[0] as { verdict_hash: string | null }).verdict_hash = null;
    expect(verifyAuditExport(y)).toMatchObject({ ok: false, code: "E_UNANCHORED" });
  });
  it("another org named in the file → the org is in every hash: E_HASH at seq 1", () => {
    const x = clone(byTask());
    x.org_id = "00000000-0000-4000-8000-000000000002";
    expect(verifyAuditExport(x)).toMatchObject({ ok: false, code: "E_HASH", firstBadSeq: 1 });
  });
});
