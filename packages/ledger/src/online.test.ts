import { describe, expect, it } from "vitest";
import { jcs, sha256Tag } from "@mandat/contract";
import { appendLedgerOnline, readLedgerOnline, verifyOnlineRows } from "./online.js";
import type { OnlineLedgerRow, SqlClient } from "./online.js";

// A JS model of private.ledger_append (same formula) — the SQL itself is tested by pgTAP and the db docker test.
const ORG = "00000000-0000-4000-8000-000000000001";
function fakeDb(): SqlClient & { rows: OnlineLedgerRow[] } {
  const rows: OnlineLedgerRow[] = [];
  return {
    rows,
    query<T>(text: string, params: unknown[] = []) {
      if (text.includes("ledger_append")) {
        const [org, kind, task, payloadJcs, payloadHash] = params as [string, string, string | null, string | null, string | null];
        if (payloadJcs !== null && sha256Tag(payloadJcs) !== payloadHash) return Promise.reject(new Error("ledger_append: payload hash mismatch"));
        const prev = rows.filter((r) => r.org_id === org).at(-1);
        const body = { org_id: org, seq: prev ? Number(prev.seq) + 1 : 1, ts: "2026-10-20T00:00:00.000Z", kind, task_id: task, payload_hash: payloadHash, prev_hash: prev?.hash ?? null };
        const row: OnlineLedgerRow = { ...body, seq: String(body.seq), payload_jcs: payloadJcs, hash: sha256Tag(jcs(body)) };
        rows.push(row);
        return Promise.resolve({ rows: [row as T] });
      }
      return Promise.resolve({ rows: rows.filter((r) => r.org_id === params[0]) as T[] });
    },
  };
}

describe("ledger online (т. 5.4)", () => {
  it("append → read → verify OK; same formula as E0", async () => {
    const db = fakeDb();
    await appendLedgerOnline(db, { org_id: ORG, kind: "task_created", task_id: "t_a", payload: { b: 2, a: 1 } });
    await appendLedgerOnline(db, { org_id: ORG, kind: "verdict", task_id: "t_a", payload: null });
    const rows = await readLedgerOnline(db, ORG);
    expect(rows[0]?.payload_jcs).toBe('{"a":1,"b":2}');
    expect(verifyOnlineRows(rows, ORG)).toEqual({ ok: true, count: 2, lastHash: rows[1]?.hash });
  });
  it("подмяна на payload_jcs или неканоничен JCS → E_PAYLOAD; подмяна на ts → E_HASH; чужд org → E_ORG", async () => {
    const db = fakeDb();
    await appendLedgerOnline(db, { org_id: ORG, kind: "task_created", task_id: "t_a", payload: { a: 1 } });
    await appendLedgerOnline(db, { org_id: ORG, kind: "verdict", task_id: "t_a", payload: { r: "VERIFIED" } });
    const rows = await readLedgerOnline(db, ORG);
    const t1 = rows.map((r) => ({ ...r }));
    (t1[1] as OnlineLedgerRow).payload_jcs = '{"r":"FAILED"}';
    expect(verifyOnlineRows(t1, ORG)).toMatchObject({ ok: false, code: "E_PAYLOAD", firstBadSeq: 2 });
    const t2 = rows.map((r) => ({ ...r }));
    (t2[0] as OnlineLedgerRow).payload_jcs = '{ "a":1}';
    (t2[0] as OnlineLedgerRow).payload_hash = sha256Tag('{ "a":1}');
    expect(verifyOnlineRows(t2, ORG)).toMatchObject({ ok: false });
    const t3 = rows.map((r) => ({ ...r }));
    (t3[0] as OnlineLedgerRow).ts = "2026-10-21T00:00:00.000Z";
    expect(verifyOnlineRows(t3, ORG)).toMatchObject({ ok: false, code: "E_HASH", firstBadSeq: 1 });
    expect(verifyOnlineRows(rows, "00000000-0000-4000-8000-000000000009")).toMatchObject({ ok: false, code: "E_ORG" });
    const t4 = rows.map((r) => ({ ...r }));
    (t4[0] as OnlineLedgerRow).payload_jcs = "not json";
    expect(verifyOnlineRows(t4, ORG)).toMatchObject({ ok: false, code: "E_PAYLOAD" });
    const t5 = rows.map((r) => ({ ...r }));
    (t5[0] as OnlineLedgerRow).payload_jcs = null;
    expect(verifyOnlineRows(t5, ORG)).toMatchObject({ ok: false, code: "E_PAYLOAD" });
  });
  it("грешен hash → отказ от функцията", async () => {
    const db = fakeDb();
    await expect(db.query("select * from private.ledger_append($1)", [ORG, "verdict", null, "{}", "sha256:x"])).rejects.toThrow(/mismatch/);
  });
});
