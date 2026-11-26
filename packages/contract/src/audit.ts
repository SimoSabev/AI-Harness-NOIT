import { z } from "zod";
import { Sha256, TaskId } from "./schemas.js";

// E10 hosted (v5 т. 6.1, D-704): the audit export. The file carries the org's WHOLE hash chain (seq 1..N, hashes only),
// and the payload of the rows the selection picks; a row outside it keeps its payload_hash, so the chain still verifies
// offline (`mandat verify-log --audit <file>`) without showing other tasks' payloads. Records (tasks, verdicts,
// approvals) are context; a verdict is trusted only when an included `verdict` row of the ledger names its hash.

export const AUDIT_FORMAT = "mandat.audit/v1";
const Iso = z.string().datetime();

export const AuditSelection = z.union([
  z.object({ task: TaskId }).strict(),
  z
    .object({ from: Iso, to: Iso })
    .strict()
    .refine((p) => Date.parse(p.from) < Date.parse(p.to), { message: "from must be before to" }),
]);
export type AuditSelection = z.infer<typeof AuditSelection>;

/** true when a ledger row belongs to the selection: the task's rows, or rows whose ts is in [from, to) */
export function auditSelects(s: AuditSelection, r: { task_id: string | null; ts: string }): boolean {
  if ("task" in s) return r.task_id === s.task;
  const t = Date.parse(r.ts);
  return t >= Date.parse(s.from) && t < Date.parse(s.to);
}

export const AuditLedgerRow = z
  .object({
    seq: z.number().int().min(1),
    ts: z.string().min(1).max(64),
    kind: z.string().min(1).max(64),
    task_id: z.string().max(64).nullable(),
    payload_hash: Sha256.nullable(),
    prev_hash: Sha256.nullable(),
    hash: Sha256,
    /** the canonical payload (JCS) of an included row; null for a row outside the selection */
    payload_jcs: z.string().nullable(),
    included: z.boolean(),
  })
  .strict();
export type AuditLedgerRow = z.infer<typeof AuditLedgerRow>;

export const AuditVerdict = z
  .object({ task_id: TaskId, run_id: z.string().min(1).max(64), attempt: z.number().int().min(1), result: z.string().min(1).max(20), verdict_hash: z.string().max(80).nullable(), created_at: z.string().min(1).max(64) })
  .strict();
export type AuditVerdict = z.infer<typeof AuditVerdict>;

export const AuditExport = z
  .object({
    format: z.literal(AUDIT_FORMAT),
    org_id: z.string().uuid(),
    generated_at: Iso,
    /** "cli" (the operator's database URL) or the user id the export ran as (RLS + ledger.export) */
    generated_by: z.union([z.literal("cli"), z.string().uuid()]),
    selection: AuditSelection,
    ledger: z.array(AuditLedgerRow),
    records: z
      .object({
        tasks: z.array(z.record(z.string(), z.unknown())),
        verdicts: z.array(AuditVerdict),
        approvals: z.array(z.record(z.string(), z.unknown())),
      })
      .strict(),
  })
  .strict();
export type AuditExport = z.infer<typeof AuditExport>;
