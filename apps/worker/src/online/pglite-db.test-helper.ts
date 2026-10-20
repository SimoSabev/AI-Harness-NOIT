import { freshDb } from "../../../../scripts/test-db.mjs";
import type { Db } from "./db.js";

// A Db over PGlite (migrations + shim) for unit tests: one in-process connection, so `connect()` shares it.
export async function pgliteDb(): Promise<Db & { raw: { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }> } }> {
  const pg = (await freshDb()) as { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; close: () => Promise<void> };
  const q = async <T>(text: string, params?: unknown[]) => ({ rows: (await pg.query(text, params)).rows as T[] });
  return {
    raw: pg,
    query: q,
    connect: () => Promise.resolve({ query: q, release: () => undefined }),
    end: () => pg.close(),
  };
}
