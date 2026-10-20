import "server-only";
import pg from "pg";
import type { Db } from "./sql";

// One pool per server process. MANDAT_DB_URL (the same name as the worker/CLI); default: the local Supabase stack.
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let pool: pg.Pool | null = null;

export function db(): Db {
  pool ??= new pg.Pool({ connectionString: process.env.MANDAT_DB_URL ?? LOCAL, max: 5, idleTimeoutMillis: 10_000 });
  const p = pool;
  return {
    query: async (text, params) => ({ rows: (await p.query(text, params)).rows }),
    connect: async () => {
      const c = await p.connect();
      return { query: async (text, params) => ({ rows: (await c.query(text, params)).rows }), release: () => c.release() };
    },
  };
}
