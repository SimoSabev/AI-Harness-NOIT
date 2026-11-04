import { SyncRecord, WrappedVaultKey, type SyncChange } from "@mandat/contract";
import type { SyncStore } from "@mandat/sync";
import type { Db, Sql } from "../sql";

// D-491: the sync server's store over Postgres (deploy/sync-server/schema.sql). Each call is one transaction as the
// role mandat_sync with the person's id in `mandat.sync_uid`; forced RLS keeps every query inside that person's rows.
async function asPerson<T>(db: Db, uid: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error("bad sync user id");
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query("set local role mandat_sync");
    await c.query("select set_config('mandat.sync_uid', $1, true)", [uid]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

interface Row { kind: string; id: string; rev: string | number; updated_at: Date | string; deleted: boolean; body: unknown }
const toRecord = (r: Row): SyncRecord =>
  SyncRecord.parse({ kind: r.kind, id: r.id, rev: Number(r.rev), updatedAt: new Date(r.updated_at).toISOString(), deleted: r.deleted, body: r.body });

export function pgSyncStore(db: Db): SyncStore {
  return {
    since: (uid, rev) =>
      asPerson(db, uid, async (s) => (await s.query<Row>("select kind, id, rev, updated_at, deleted, body from sync.records where user_id = $1 and rev > $2 order by rev limit 5000", [uid, rev])).rows.map(toRecord)),
    get: (uid, kind, id) =>
      asPerson(db, uid, async (s) => {
        const r = (await s.query<Row>("select kind, id, rev, updated_at, deleted, body from sync.records where user_id = $1 and kind = $2 and id = $3", [uid, kind, id])).rows[0];
        return r ? toRecord(r) : null;
      }),
    putIf: (uid, c: SyncChange, expected) =>
      asPerson(db, uid, async (s) => {
        const cur = (await s.query<{ rev: string }>("select rev from sync.records where user_id = $1 and kind = $2 and id = $3 for update", [uid, c.kind, c.id])).rows[0];
        if (cur && Number(cur.rev) !== expected) return null;
        const next = (await s.query<{ rev: string }>(
          "insert into sync.counters (user_id, rev) values ($1, 1) on conflict (user_id) do update set rev = sync.counters.rev + 1 returning rev", [uid])).rows[0];
        const rev = Number(next?.rev);
        await s.query(
          `insert into sync.records (user_id, kind, id, rev, updated_at, deleted, body) values ($1, $2, $3, $4, now(), $5, $6::jsonb)
           on conflict (user_id, kind, id) do update set rev = excluded.rev, updated_at = now(), deleted = excluded.deleted, body = excluded.body`,
          [uid, c.kind, c.id, rev, c.deleted, JSON.stringify(c.deleted ? {} : c.body)]);
        return rev;
      }),
    wipe: (uid) =>
      asPerson(db, uid, async (s) => {
        await s.query("delete from sync.records where user_id = $1", [uid]);
        await s.query("delete from sync.vaults where user_id = $1", [uid]);
      }),
    getVault: (uid) =>
      asPerson(db, uid, async (s) => {
        const r = (await s.query<{ wrapped: unknown }>("select wrapped from sync.vaults where user_id = $1", [uid])).rows[0];
        return r ? WrappedVaultKey.parse(r.wrapped) : null;
      }),
    putVault: (uid, w) =>
      asPerson(db, uid, async (s) => {
        await s.query("insert into sync.vaults (user_id, wrapped) values ($1, $2::jsonb) on conflict (user_id) do update set wrapped = excluded.wrapped, updated_at = now()", [uid, JSON.stringify(WrappedVaultKey.parse(w))]);
      }),
  };
}
