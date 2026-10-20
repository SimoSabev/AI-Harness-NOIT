import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import type { Db } from "./db.js";

// D-274 / E3в: an in-process Postgres (PGlite) with the Supabase shim and all migrations, for offline demos
// (`mandat demo spill --fake`). Nothing is written outside the process; the database is gone on exit.
export async function offlineDb(repoRoot: string): Promise<Db> {
  const pg = await PGlite.create({ extensions: { pgcrypto } });
  const dir = (d: string) => path.join(repoRoot, "supabase", d);
  await pg.exec(readFileSync(dir("shim/supabase-shim.sql"), "utf8"));
  for (const f of readdirSync(dir("migrations")).filter((x) => x.endsWith(".sql")).sort()) await pg.exec(readFileSync(path.join(dir("migrations"), f), "utf8"));
  const q = async <T>(text: string, params?: unknown[]) => ({ rows: (await pg.query(text, params)).rows as T[] });
  let lock: Promise<void> = Promise.resolve();
  return {
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
}
