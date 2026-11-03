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

const CONNECTION_CODES: ReadonlySet<string> = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "57P01", "57P02", "57P03"]);
const CONNECTION_TEXT = /^(Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error)/;

/** D-444: the database is out of reach for now (the worker retries); an SQL error or a bug is not this. */
export function isDbConnectionError(e: unknown): boolean {
  for (let cur = e, depth = 0; cur instanceof Error && depth < 5; cur = cur.cause, depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && (CONNECTION_CODES.has(code) || code.startsWith("08"))) return true;
    if (CONNECTION_TEXT.test(cur.message)) return true;
  }
  return false;
}

export function openDb(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 5000 });
  // D-444: a connection that dies emits `error`; without a listener that ends the whole process. The next query reconnects.
  const ignore = (): void => undefined;
  pool.on("error", ignore);
  return {
    query: async <T>(text: string, params?: unknown[]) => {
      const r = await pool.query(text, params);
      return { rows: r.rows as T[] };
    },
    connect: async () => {
      const c = await pool.connect();
      c.on("error", ignore);
      return {
        query: async <T>(text: string, params?: unknown[]) => {
          const r = await c.query(text, params);
          return { rows: r.rows as T[] };
        },
        release: () => {
          c.removeListener("error", ignore);
          c.release();
        },
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
