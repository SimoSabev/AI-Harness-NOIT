import { describe, expect, it } from "vitest";
import { AUDIT_FORMAT, AuditExport, AuditSelection, auditSelects } from "./audit.js";

// E10 hosted (D-704): `mandat audit export` writes this JSON; `mandat verify-log --audit` checks it offline.
const ORG = "00000000-0000-4000-8000-000000000001";
const H = (c: string) => `sha256:${c.repeat(64)}`;
const row = (seq: number, o: Partial<{ task_id: string | null; ts: string; included: boolean; payload_jcs: string | null }> = {}) => ({
  seq,
  ts: o.ts ?? "2026-11-26T10:00:00.000Z",
  kind: "verdict",
  task_id: o.task_id ?? "t_a",
  payload_hash: H("a"),
  prev_hash: seq === 1 ? null : H("b"),
  hash: H("c"),
  payload_jcs: o.payload_jcs ?? null,
  included: o.included ?? false,
});

describe("audit export (D-704)", () => {
  it("selection: a task or a period (from < to), never both or neither", () => {
    expect(AuditSelection.parse({ task: "t_a" })).toEqual({ task: "t_a" });
    expect(AuditSelection.parse({ from: "2026-11-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" }).from).toBe("2026-11-01T00:00:00.000Z");
    expect(() => AuditSelection.parse({ from: "2026-12-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" })).toThrow();
    expect(() => AuditSelection.parse({ task: "t_a", from: "2026-11-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" })).toThrow();
    expect(() => AuditSelection.parse({})).toThrow();
  });
  it("auditSelects: by task id, or by ts in [from, to)", () => {
    expect(auditSelects({ task: "t_a" }, { task_id: "t_a", ts: "x" })).toBe(true);
    expect(auditSelects({ task: "t_a" }, { task_id: "t_b", ts: "x" })).toBe(false);
    expect(auditSelects({ task: "t_a" }, { task_id: null, ts: "x" })).toBe(false);
    const p = { from: "2026-11-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" };
    expect(auditSelects(p, { task_id: null, ts: "2026-11-01T00:00:00.000Z" })).toBe(true);
    expect(auditSelects(p, { task_id: "t_a", ts: "2026-11-30T23:59:59.999Z" })).toBe(true);
    expect(auditSelects(p, { task_id: "t_a", ts: "2026-12-01T00:00:00.000Z" })).toBe(false);
    expect(auditSelects(p, { task_id: "t_a", ts: "2026-10-31T23:59:59.999Z" })).toBe(false);
  });
  it("the file: format, org, selection, the chain 1..N and the records", () => {
    const x = {
      format: AUDIT_FORMAT,
      org_id: ORG,
      generated_at: "2026-11-26T10:00:00.000Z",
      generated_by: "cli",
      selection: { task: "t_a" },
      ledger: [row(1, { included: true, payload_jcs: "{}" }), row(2)],
      records: { tasks: [{ id: "t_a", state: "CLOSED" }], verdicts: [{ task_id: "t_a", run_id: "r_1", attempt: 1, result: "VERIFIED", verdict_hash: H("d"), created_at: "2026-11-26T10:00:00.000Z" }], approvals: [] },
    };
    expect(AuditExport.parse(x).ledger).toHaveLength(2);
    expect(() => AuditExport.parse({ ...x, format: "mandat.audit/v0" })).toThrow();
    expect(() => AuditExport.parse({ ...x, secret: 1 })).toThrow();
    expect(() => AuditExport.parse({ ...x, ledger: [{ ...row(1), seq: 0 }] })).toThrow();
  });
});
