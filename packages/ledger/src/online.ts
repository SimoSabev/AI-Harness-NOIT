import { jcs, sha256Tag } from "@mandat/contract";
import type { LedgerKind } from "@mandat/contract";
import { verifyLedger } from "./verify.js";
import type { VerifyResult } from "./verify.js";

// Демо промпт т. 5.4: the ledger in Postgres. TS canonicalizes the payload (JCS) and sends its hash;
// private.ledger_append recomputes it, takes the per-org advisory lock and chains with the E0 formula.

/** The minimum of a pg client (pg.Pool / pg.Client / a transaction) this package needs. */
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface OnlineLedgerRow {
  org_id: string;
  seq: string | number;
  ts: string;
  kind: string;
  task_id: string | null;
  payload_jcs: string | null;
  payload_hash: string | null;
  prev_hash: string | null;
  hash: string;
}

export async function appendLedgerOnline(db: SqlClient, i: { org_id: string; kind: LedgerKind; task_id: string | null; payload: unknown }): Promise<OnlineLedgerRow> {
  const text = i.payload === null ? null : jcs(i.payload);
  const hash = text === null ? null : sha256Tag(text);
  const r = await db.query<OnlineLedgerRow>("select * from private.ledger_append($1::uuid, $2, $3, $4, $5)", [i.org_id, i.kind, i.task_id, text, hash]);
  const row = r.rows[0];
  if (!row) throw new Error("ledger_append returned no row");
  return row;
}

export async function readLedgerOnline(db: SqlClient, org: string): Promise<OnlineLedgerRow[]> {
  const r = await db.query<OnlineLedgerRow>(
    "select org_id::text as org_id, seq, ts, kind, task_id, payload_jcs, payload_hash, prev_hash, hash from public.ledger where org_id = $1::uuid order by seq",
    [org],
  );
  return r.rows;
}

/** Same chain check as the file ledger (E0) + JCS(payload) == payload_jcs and its hash. */
export function verifyOnlineRows(rows: OnlineLedgerRow[], org: string): VerifyResult {
  const lines = rows.map((r) => JSON.stringify({ org_id: r.org_id, seq: Number(r.seq), ts: r.ts, kind: r.kind, task_id: r.task_id, payload_hash: r.payload_hash, prev_hash: r.prev_hash, hash: r.hash }));
  const chain = verifyLedger(lines, { org });
  const upto = chain.ok ? rows.length : chain.countOk;
  for (let k = 0; k < upto; k++) {
    const r = rows[k] as OnlineLedgerRow;
    const bad = (message: string): VerifyResult => ({ ok: false, countOk: k, firstBadSeq: k + 1, line: k + 1, code: "E_PAYLOAD", message });
    if (r.payload_jcs === null) {
      if (r.payload_hash !== null) return bad("payload missing");
      continue;
    }
    if (sha256Tag(r.payload_jcs) !== r.payload_hash) return bad("payload hash mismatch");
    let canon: string;
    try {
      canon = jcs(JSON.parse(r.payload_jcs));
    } catch {
      return bad("payload is not JSON");
    }
    if (canon !== r.payload_jcs) return bad("payload_jcs is not canonical (JCS)");
  }
  return chain;
}
