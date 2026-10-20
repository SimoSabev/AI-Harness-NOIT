import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
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
  // E3б: the repo to onboard = demo-shop without .mandat.yml, as a local git remote (fakeGitHub on the Writer side)
  const src = mkdtempSync(path.join(os.tmpdir(), "mandat-e2e-shop-"));
  cpSync(path.join(repo, "fixtures/demo-shop"), src, { recursive: true, filter: (p) => !p.includes("node_modules") });
  rmSync(path.join(src, ".mandat.yml"), { force: true });
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "e2e", GIT_AUTHOR_EMAIL: "e2e@x", GIT_COMMITTER_NAME: "e2e", GIT_COMMITTER_EMAIL: "e2e@x" };
  for (const a of [["init", "-q", "-b", "main"], ["add", "-A"], ["commit", "-q", "-m", "shop"]]) execFileSync("git", a, { cwd: src, env });
  await c.query("update public.repos set remote_url = $1, provider = 'github'", [src]);
  await c.end();
}
