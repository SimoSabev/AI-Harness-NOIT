import type { SyncBody, SyncChange, SyncKind, SyncRecord } from "@mandat/contract";
import { sameJson as same } from "./same.js";

// D-492: the server is the source of truth. Bodies are merged field by field against the last copy both sides shared
// (three-way); a field changed on both sides keeps the server's value and the device is told what it lost. With no
// common base (the first sign-in) the server's fields win where they differ. Task history is append-only.

export interface Conflict { field: string; local: unknown; server: unknown }
export interface RecordConflict extends Conflict { kind: SyncKind; id: string }
export interface LocalRecord { kind: SyncKind; id: string; body: SyncBody; deleted: boolean }

export function mergeBodies(base: SyncBody | null, local: SyncBody, server: SyncBody): { body: SyncBody; conflicts: Conflict[] } {
  const b = base ?? {};
  const body: SyncBody = {};
  const conflicts: Conflict[] = [];
  for (const k of [...new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(server)])].sort()) {
    const lChanged = !same(local[k], b[k]);
    const sChanged = !same(server[k], b[k]);
    const v = lChanged && !sChanged ? local[k] : server[k];
    if (lChanged && sChanged && !same(local[k], server[k])) conflicts.push({ field: k, local: local[k], server: server[k] });
    if (v !== undefined) body[k] = v;
  }
  return { body, conflicts };
}

export const APPEND_ONLY: ReadonlySet<SyncKind> = new Set(["task"]);
const key = (r: { kind: string; id: string }): string => `${r.kind}/${r.id}`;

export interface FirstSignInPlan {
  upload: SyncChange[];
  download: SyncRecord[];
  merged: SyncChange[];
  conflicts: RecordConflict[];
}

export function planFirstSignIn(local: readonly LocalRecord[], remote: readonly SyncRecord[]): FirstSignInPlan {
  const byKey = new Map(remote.map((r) => [key(r), r]));
  const localKeys = new Set(local.map(key));
  const plan: FirstSignInPlan = { upload: [], download: remote.filter((r) => !localKeys.has(key(r))), merged: [], conflicts: [] };
  for (const l of local) {
    const r = byKey.get(key(l));
    if (!r) {
      plan.upload.push({ kind: l.kind, id: l.id, baseRev: 0, deleted: l.deleted, body: l.body });
      continue;
    }
    if (APPEND_ONLY.has(l.kind) || same(l.body, r.body)) continue;
    const m = mergeBodies(null, l.body, r.body);
    plan.conflicts.push(...m.conflicts.map((c) => ({ kind: l.kind, id: l.id, ...c })));
    plan.merged.push({ kind: l.kind, id: l.id, baseRev: r.rev, deleted: false, body: m.body });
  }
  return plan;
}
