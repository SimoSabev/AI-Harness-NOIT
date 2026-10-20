#!/usr/bin/env node
// D-274: migrations + pgTAP in PGlite (Postgres 17 in WASM, in-process). The same files run with `supabase test db`
// against the real Supabase stack (`pnpm test:db:supabase`) when its images can be pulled.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pgtap } from "@electric-sql/pglite-pgtap";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = (d) => path.join(repo, "supabase", d);

/** TAP lines out of the result sets of one test file. */
export function tapLines(results) {
  return results.flatMap((r) => r.rows.flatMap((row) => Object.values(row).filter((v) => typeof v === "string" && /^(ok|not ok|1\.\.\d+|#)/.test(v))));
}

export async function freshDb() {
  const db = await PGlite.create({ extensions: { pgcrypto, pgtap } });
  await db.exec(readFileSync(dir("shim/supabase-shim.sql"), "utf8"));
  for (const f of readdirSync(dir("migrations")).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(path.join(dir("migrations"), f), "utf8"));
  await db.exec("create extension if not exists pgtap");
  return db;
}

/** Runs every supabase/tests/*.test.sql on a fresh database; returns per-file results. */
export async function runDbTests() {
  const out = [];
  for (const f of readdirSync(dir("tests")).filter((x) => x.endsWith(".test.sql")).sort()) {
    const db = await freshDb();
    try {
      const lines = tapLines(await db.exec(readFileSync(path.join(dir("tests"), f), "utf8")));
      const plan = Number(/^1\.\.(\d+)/.exec(lines.find((l) => l.startsWith("1..")) ?? "")?.[1] ?? NaN);
      const oks = lines.filter((l) => /^ok \d+/.test(l)).length;
      const fails = lines.filter((l) => /^not ok/.test(l));
      out.push({ file: f, plan, passed: oks, failed: fails, ok: fails.length === 0 && oks === plan, error: null });
    } catch (e) {
      out.push({ file: f, plan: NaN, passed: 0, failed: [], ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      await db.close();
    }
  }
  return out;
}

/** The same files against a real database (the local Supabase stack) through psql; each file rolls back. */
export function runDbTestsPsql(url) {
  const out = [];
  execFileSync("psql", [url, "-XAtq", "-c", "create extension if not exists pgtap with schema extensions"], { encoding: "utf8" });
  for (const f of readdirSync(dir("tests")).filter((x) => x.endsWith(".test.sql")).sort()) {
    let text;
    try {
      text = execFileSync("psql", [url, "-XAt", "-v", "ON_ERROR_STOP=0", "-c", "set search_path = public, extensions", "-f", path.join(dir("tests"), f)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      text = String(e.stdout ?? "") + String(e.stderr ?? "");
    }
    const lines = text.split("\n");
    const plan = Number(/^1\.\.(\d+)/m.exec(text)?.[1] ?? NaN);
    const oks = lines.filter((l) => /^ok \d+/.test(l)).length;
    const fails = lines.filter((l) => /^not ok/.test(l));
    out.push({ file: f, plan, passed: oks, failed: fails, ok: fails.length === 0 && oks === plan, error: null });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ui = process.argv.indexOf("--url");
  const url = ui > 0 ? process.argv[ui + 1] : null;
  const res = url ? runDbTestsPsql(url) : await runDbTests();
  let bad = 0;
  for (const r of res) {
    console.log(`${r.ok ? "ok" : "FAIL"} ${r.file}: ${r.passed}/${r.plan}${r.error ? ` ERROR ${r.error}` : ""}`);
    for (const f of r.failed) console.log(`  ${f}`);
    if (!r.ok) bad++;
  }
  console.log(bad === 0 ? `db tests ok (${res.length} files, ${url ? "supabase" : "pglite"})` : `db tests FAILED (${bad}/${res.length} files)`);
  process.exit(bad === 0 ? 0 : 1);
}
