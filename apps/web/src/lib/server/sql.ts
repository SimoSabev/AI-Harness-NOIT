// The web reads under RLS as the signed-in user (role authenticated + request.jwt.claims, as PostgREST does) and
// writes as service_role only through the actions module. One pg connection per transaction.
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Db extends Sql {
  connect(): Promise<Sql & { release(): void }>;
}

async function tx<T>(db: Db, role: "authenticated" | "service_role", uid: string | null, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    if (uid !== null) await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
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

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function asUser<T>(db: Db, uid: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  if (!UUID.test(uid)) throw new Error("bad user id");
  return tx(db, "authenticated", uid, fn);
}

export function asService<T>(db: Db, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return tx(db, "service_role", null, fn);
}
