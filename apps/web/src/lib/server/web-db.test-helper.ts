import { freshDb } from "../../../../../scripts/test-db.mjs";
import { DEMO_USERS, seedDemo } from "../../../../worker/src/online/seed";
import type { Db } from "./sql";

// PGlite (migrations + shim) with the full demo seed. One in-process connection: connect() takes a mutex so that
// "parallel" transactions run one after another instead of interleaving on the same connection.
export const TEST_PASSWORD = "test-password-not-secret";
export const TEST_TOTP = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export const U = { owner: DEMO_USERS[0].id, approver: DEMO_USERS[1].id, viewer: DEMO_USERS[2].id };

export async function webDb(): Promise<Db & { end: () => Promise<void> }> {
  const pg = (await freshDb()) as { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; close: () => Promise<void> };
  const q = async <T>(text: string, params?: unknown[]) => ({ rows: (await pg.query(text, params)).rows as T[] });
  let lock: Promise<void> = Promise.resolve();
  const db: Db & { end: () => Promise<void> } = {
    query: q,
    connect: async () => {
      let release!: () => void;
      const prev = lock;
      lock = new Promise<void>((r) => (release = r));
      await prev;
      return { query: q, release };
    },
    end: () => pg.close(),
  };
  await seedDemo(db, { remoteUrl: "file:///tmp/demo-shop.git", password: () => TEST_PASSWORD, totpSecret: () => TEST_TOTP });
  return db;
}

export async function changesetOf(db: Db, task: string): Promise<{ id: string; head_sha: string }> {
  const r = await db.query<{ id: string; head_sha: string }>("select id::text as id, head_sha from public.changesets where task_id = $1", [task]);
  const row = r.rows[0];
  if (!row) throw new Error(`no changeset for ${task}`);
  return row;
}
