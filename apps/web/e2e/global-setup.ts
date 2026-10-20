import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { seedDemo } from "@mandat/worker";
import { E2E_DB } from "../playwright.config";
import { PASSWORD, TOTP } from "./fixtures";

// A fresh database `mandat_e2e` on the local Postgres: shim (auth.users, roles, realtime stubs) + all migrations +
// the full demo seed with the test credentials above. The demo database itself is never touched.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export default async function globalSetup(): Promise<void> {
  const url = new URL(E2E_DB);
  const name = url.pathname.slice(1);
  if (!/^mandat_e2e[a-z0-9_]*$/.test(name)) throw new Error(`refusing to reset database ${name}`);
  const admin = new pg.Client({ connectionString: E2E_DB.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  await c.query(readFileSync(path.join(repo, "supabase/shim/supabase-shim.sql"), "utf8"));
  for (const f of readdirSync(path.join(repo, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort()) await c.query(readFileSync(path.join(repo, "supabase/migrations", f), "utf8"));
  await seedDemo({ query: async (text: string, params?: unknown[]) => ({ rows: (await c.query(text, params)).rows }) }, { remoteUrl: "file:///tmp/demo-shop.git", password: () => PASSWORD, totpSecret: () => TOTP });
  await c.end();
}
