import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendLedgerOnline, readLedgerOnline, verifyOnlineRows } from "@mandat/ledger";
import { repoRoot } from "../testing.js";
import { openDb } from "./db.js";
import type { Db } from "./db.js";
import { drainOutbox } from "./outbox.js";
import { PgOutbox, enqueueOutbox } from "./pg-outbox.js";
import { DEMO_ORG_ID, seedMinimal } from "./seed.js";

// Real Postgres 17 (postgres:17.6-alpine, D-274) for what PGlite cannot do: parallel connections.
const NAME = `mandat-pgtest-${process.pid}`;
const ORG = "00000000-0000-4000-8000-000000000001";
const docker = (...a: string[]) => spawnSync("docker", a, { encoding: "utf8" });
let db: Db;

beforeAll(async () => {
  const r = docker("run", "-d", "--rm", "--name", NAME, "-e", "POSTGRES_PASSWORD=postgres", "postgres:17.6-alpine");
  if (r.status !== 0) throw new Error(`postgres container: ${r.stderr}`);
  const ip = docker("inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", NAME).stdout.trim();
  db = openDb(`postgresql://postgres:postgres@${ip}:5432/postgres`);
  for (let k = 0; k < 60; k++) {
    try {
      await db.query("select 1");
      break;
    } catch {
      await new Promise((res) => setTimeout(res, 500));
    }
  }
  await db.query(readFileSync(path.join(repoRoot, "supabase/shim/supabase-shim.sql"), "utf8"));
  const dir = path.join(repoRoot, "supabase/migrations");
  for (const f of readdirSync(dir).sort()) await db.query(readFileSync(path.join(dir, f), "utf8"));
  await db.query("insert into public.orgs (id, name) values ($1, 'demo')", [ORG]);
}, 120_000);
afterAll(async () => {
  await db?.end();
  docker("rm", "-f", NAME);
});

describe("Postgres (docker)", () => {
  it("двама паралелни писачи в дневника → без дупки, веригата е цяла", async () => {
    const writer = async (w: number) => {
      const c = await db.connect();
      try {
        for (let k = 0; k < 20; k++) await appendLedgerOnline(c, { org_id: ORG, kind: "verdict", task_id: "t_par", payload: { w, k } });
      } finally {
        c.release();
      }
    };
    await Promise.all([writer(1), writer(2)]);
    const rows = await readLedgerOnline(db, ORG);
    expect(rows.map((r) => Number(r.seq))).toEqual(Array.from({ length: 40 }, (_, k) => k + 1));
    expect(verifyOnlineRows(rows, ORG)).toMatchObject({ ok: true, count: 40 });
  });
  it("outbox: два паралелни drain-а → всеки ефект точно веднъж (SKIP LOCKED)", async () => {
    for (let k = 0; k < 10; k++) expect(await enqueueOutbox(db, { org_id: ORG, kind: "check_run", idempotency_key: `cr:${k}` })).toBe(true);
    expect(await enqueueOutbox(db, { org_id: ORG, kind: "check_run", idempotency_key: "cr:0" })).toBe(false);
    const seen: string[] = [];
    const drain = async () => {
      const c = await db.connect();
      try {
        return await drainOutbox(new PgOutbox(c), { check_run: async (r) => void seen.push(r.idempotency_key) });
      } finally {
        c.release();
      }
    };
    const [a, b] = await Promise.all([drain(), drain()]);
    expect((a?.done ?? 0) + (b?.done ?? 0)).toBe(10);
    expect(new Set(seen).size).toBe(10);
    expect(seen).toHaveLength(10);
    const again = await drain();
    expect(again.done).toBe(0);
  });
  it("demo seed --minimal: идемпотентен; дневникът на demo org е цял", async () => {
    expect(await seedMinimal(db, { remoteUrl: "file:///x/demo-shop.git" })).toMatchObject({ org: DEMO_ORG_ID, created: true });
    expect(await seedMinimal(db, { remoteUrl: "file:///x/demo-shop.git" })).toMatchObject({ created: false });
    const rows = await readLedgerOnline(db, DEMO_ORG_ID);
    expect(rows.map((r) => r.kind)).toEqual(["demo_reset"]);
    expect((await db.query<{ is_demo: boolean }>("select is_demo from public.orgs where id = $1", [DEMO_ORG_ID])).rows[0]?.is_demo).toBe(true);
  });
  it("пряка подмяна на дневника е отказана; verify-log --org през CLI", async () => {
    await expect(db.query("update public.ledger set kind = 'x' where seq = 1")).rejects.toThrow(/append-only/);
    const ip = docker("inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", NAME).stdout.trim();
    const r = spawnSync("node", [path.join(repoRoot, "packages/cli/dist/main.js"), "verify-log", "--org", ORG], { encoding: "utf8", env: { ...process.env, MANDAT_DB_URL: `postgresql://postgres:postgres@${ip}:5432/postgres` } });
    expect(r.stdout).toMatch(/OK: chain intact \(seq 1\.\.40/);
    expect(r.status).toBe(0);
  });
});
