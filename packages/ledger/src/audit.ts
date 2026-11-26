import { AUDIT_FORMAT, AuditExport, auditSelects, jcs, sha256Tag } from "@mandat/contract";
import type { AuditLedgerRow, AuditSelection, AuditVerdict } from "@mandat/contract";
import { verifyLedger } from "./verify.js";
import type { VerifyCode } from "./verify.js";
import type { OnlineLedgerRow } from "./online.js";

// E10 hosted (v5 т. 6.1, D-704): the audit export is the org's whole chain (seq 1..N, hashes) plus the payloads of the
// rows the selection picks. Pure functions: the CLI reads the rows (operator URL or as a user under RLS) and writes the file.

export type AuditVerifyCode = VerifyCode | "E_SELECTION" | "E_UNANCHORED";
export type AuditVerifyResult =
  | { ok: true; count: number; included: number; verdicts: number; lastHash: string | null }
  | { ok: false; code: AuditVerifyCode; message: string; firstBadSeq: number | null; countOk: number };

export function buildAuditExport(i: {
  org: string;
  selection: AuditSelection;
  rows: readonly OnlineLedgerRow[];
  records: { tasks: Record<string, unknown>[]; verdicts: AuditVerdict[]; approvals: Record<string, unknown>[] };
  generatedAt: string;
  generatedBy: "cli" | string;
}): AuditExport {
  const ledger: AuditLedgerRow[] = i.rows.map((r) => {
    if (r.org_id !== i.org) throw new Error(`audit export: a ledger row of another org (${r.org_id})`);
    const included = auditSelects(i.selection, r);
    return { seq: Number(r.seq), ts: r.ts, kind: r.kind, task_id: r.task_id, payload_hash: r.payload_hash, prev_hash: r.prev_hash, hash: r.hash, payload_jcs: included ? r.payload_jcs : null, included };
  });
  return AuditExport.parse({ format: AUDIT_FORMAT, org_id: i.org, generated_at: i.generatedAt, generated_by: i.generatedBy, selection: i.selection, ledger, records: i.records });
}

/** Offline check of an export: the chain, each included payload, the selection is honest, every verdict is anchored. */
export function verifyAuditExport(input: unknown): AuditVerifyResult {
  const parsed = AuditExport.safeParse(input);
  if (!parsed.success) return { ok: false, code: "E_SCHEMA", message: `not a ${AUDIT_FORMAT} file: ${parsed.error.issues[0]?.message ?? "invalid"}`, firstBadSeq: null, countOk: 0 };
  const x = parsed.data;
  const lines = x.ledger.map((r) => JSON.stringify({ org_id: x.org_id, seq: r.seq, ts: r.ts, kind: r.kind, task_id: r.task_id, payload_hash: r.payload_hash, prev_hash: r.prev_hash, hash: r.hash }));
  const chain = verifyLedger(lines, { org: x.org_id });
  if (!chain.ok) return { ok: false, code: chain.code, message: chain.message, firstBadSeq: chain.firstBadSeq, countOk: chain.countOk };
  const anchored = new Set<string>();
  for (const [k, r] of x.ledger.entries()) {
    const bad = (code: AuditVerifyCode, message: string): AuditVerifyResult => ({ ok: false, code, message, firstBadSeq: r.seq, countOk: k });
    // the exporter can neither hide a selected row nor show one outside the selection
    if (r.included !== auditSelects(x.selection, r)) return bad("E_SELECTION", r.included ? "a row outside the selection is included" : "a selected row is left out");
    if (!r.included) {
      if (r.payload_jcs !== null) return bad("E_SELECTION", "a row outside the selection carries its payload");
      continue;
    }
    if (r.payload_jcs === null) {
      if (r.payload_hash !== null) return bad("E_PAYLOAD", "payload missing");
      continue;
    }
    if (sha256Tag(r.payload_jcs) !== r.payload_hash) return bad("E_PAYLOAD", "payload hash mismatch");
    let payload: unknown;
    try {
      payload = JSON.parse(r.payload_jcs);
    } catch {
      return bad("E_PAYLOAD", "payload is not JSON");
    }
    if (jcs(payload) !== r.payload_jcs) return bad("E_PAYLOAD", "payload_jcs is not canonical (JCS)");
    if (r.kind === "verdict" && r.task_id !== null && payload !== null && typeof payload === "object") {
      const vh = (payload as { verdict_hash?: unknown }).verdict_hash;
      if (typeof vh === "string") anchored.add(`${r.task_id} ${vh}`);
    }
  }
  for (const v of x.records.verdicts) {
    if (v.verdict_hash === null || !anchored.has(`${v.task_id} ${v.verdict_hash}`)) {
      return { ok: false, code: "E_UNANCHORED", message: `the verdict ${v.run_id} of ${v.task_id} is not named by an included ledger row`, firstBadSeq: null, countOk: x.ledger.length };
    }
  }
  return { ok: true, count: x.ledger.length, included: x.ledger.filter((r) => r.included).length, verdicts: x.records.verdicts.length, lastHash: chain.lastHash };
}
