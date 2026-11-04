import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSyncServer } from "@mandat/sync";
import type { Db } from "../sql";
import { pgSyncStore } from "./sync-store";

// D-491: the Postgres store under forced RLS, on PGlite with deploy/sync-server/schema.sql.
const schema = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../deploy/sync-server/schema.sql"), "utf8");
let pg: PGlite;
let db: Db;

beforeAll(async () => {
  pg = await PGlite.create();
  await pg.exec(schema);
  const q = async <T>(text: string, params?: unknown[]) => ({ rows: (await pg.query(text, params)).rows as T[] });
  db = { query: q, connect: () => Promise.resolve({ query: q, release: () => undefined }) };
});
afterAll(async () => {
  await pg.close();
});

describe("Postgres sync store (D-491)", () => {
  it("push, pull, conflict and wipe behave like the reference store", async () => {
    const s = createSyncServer(pgSyncStore(db));
    expect((await s.push("alice", [{ kind: "prefs", id: "ui", baseRev: 0, deleted: false, body: { lang: "bg" } }])).accepted).toEqual([{ kind: "prefs", id: "ui", rev: 1 }]);
    expect((await s.push("alice", [{ kind: "prefs", id: "ui", baseRev: 1, deleted: false, body: { lang: "en" } }])).accepted[0]?.rev).toBe(2);
    const stale = await s.push("alice", [{ kind: "prefs", id: "ui", baseRev: 1, deleted: false, body: { lang: "de" } }]);
    expect(stale.conflicts.map((c) => c.body)).toEqual([{ lang: "en" }]);
    const p = await s.pull("alice", 0);
    expect(p.records.map((r) => [r.kind, r.id, r.rev, r.body])).toEqual([["prefs", "ui", 2, { lang: "en" }]]);
    expect(p.cursor).toBe(2);

    await s.putVault("alice", { v: 1, kdf: "scrypt", n: 1024, r: 8, p: 1, salt: "s", kid: "0123456789abcdef", iv: "i", ct: "c", tag: "t" });
    expect((await s.getVault("alice"))?.kid).toBe("0123456789abcdef");
    await s.wipe("alice");
    expect((await s.pull("alice", 0)).records).toEqual([]);
    expect(await s.getVault("alice")).toBeNull();
  });

  it("forced RLS: as one person, even a query with no WHERE sees no one else's rows", async () => {
    const s = createSyncServer(pgSyncStore(db));
    await s.push("bob", [{ kind: "project", id: "p", baseRev: 0, deleted: false, body: { name: "bob's" } }]);
    await pg.exec("begin");
    await pg.exec("set local role mandat_sync");
    await pg.query("select set_config('mandat.sync_uid', 'carol', true)");
    const seen = await pg.query("select * from sync.records");
    const forged = await pg.query("insert into sync.records (user_id, kind, id, rev, body) values ('bob', 'project', 'q', 9, '{}') returning 1").catch((e: unknown) => e);
    await pg.exec("rollback");
    expect(seen.rows).toEqual([]);
    expect(forged).toBeInstanceOf(Error);
  });

  it("the database itself refuses a body that is not an object", async () => {
    await expect(pg.query("insert into sync.records (user_id, kind, id, rev, body) values ('x', 'prefs', 'a', 1, '\"str\"')")).rejects.toThrow();
  });
});
