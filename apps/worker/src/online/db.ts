import pg from "pg";
import type { SqlClient } from "@mandat/ledger";

// D-216: the worker talks to Postgres with `pg`. MANDAT_DB_URL (D-273); the local Supabase default is not a secret.
export const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function dbUrl(env: Record<string, string | undefined>): string {
  return env.MANDAT_DB_URL ?? LOCAL_DB_URL;
}

export interface Db extends SqlClient {
  /** a dedicated connection (transactions, FOR UPDATE SKIP LOCKED) */
  connect(): Promise<SqlClient & { release(): void }>;
  end(): Promise<void>;
}

export function openDb(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 5000 });
  return {
    query: async <T>(text: string, params?: unknown[]) => {
      const r = await pool.query(text, params);
      return { rows: r.rows as T[] };
    },
    connect: async () => {
      const c = await pool.connect();
      return {
        query: async <T>(text: string, params?: unknown[]) => {
          const r = await c.query(text, params);
          return { rows: r.rows as T[] };
        },
        release: () => c.release(),
      };
    },
    end: () => pool.end(),
  };
}

/** Runs fn in one transaction on a dedicated connection. */
export async function inTransaction<T>(db: Db, fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
