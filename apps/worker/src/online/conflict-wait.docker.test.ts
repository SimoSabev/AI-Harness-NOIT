import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeGitHub } from "@mandat/gate-github";
import { buildFixture } from "../fixtures.js";
import { dockerEnv, repoRoot } from "../testing.js";
import { runDaemonOnce } from "./daemon.js";
import type { DaemonDeps } from "./daemon.js";
import { openDb } from "./db.js";
import type { Db } from "./db.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";

// E8f (v5 p. 4.6 (1), AC-4.2): two live tasks of one repo edit src/cart.ts (fake:slow-edit, real sandboxes, two worker
// slots on real Postgres). The later one is stopped (same_file: wait), re-queued behind the first, and runs after it.
const NAME = `mandat-pgconf-${process.pid}`;
const docker = (...a: string[]) => spawnSync("docker", a, { encoding: "utf8" });
let db: Db;
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-conf-"));
beforeAll(async () => {
  await dockerEnv();
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
  const fx = buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" });
  await seedMinimal(db, { remoteUrl: `file://${fx.mirror}` });
  for (const id of ["t_conf_a", "t_conf_b"]) {
    await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text) values ($1, $2, $3, 'bugfix', 'fake:slow-edit', 'Fix the discount')", [id, DEMO_ORG_ID, DEMO_REPO_ID]);
    await new Promise((res) => setTimeout(res, 20));
  }
}, 180_000);
afterAll(async () => {
  await db?.end();
  docker("rm", "-f", NAME);
});

describe("same file, two live tasks (docker)", () => {
  it("the later task waits for the earlier one, then runs to a verdict", async () => {
    const d: DaemonDeps = { db, home, gh: fakeGitHub({ repos: { "mandat-demo/shop": {} } }), ghRepo: "mandat-demo/shop" };
    const first = runDaemonOnce(d);
    await new Promise((res) => setTimeout(res, 4000));
    const second = runDaemonOnce(d);
    expect((await Promise.all([first, second])).sort()).toEqual(["t_conf_a", "t_conf_b"]);
    // the live session of the first task recorded what it touches (the base of the check)
    expect((await db.query<{ touching: string[] }>("select touching from public.agent_sessions where task_id = 't_conf_a'")).rows.flatMap((r) => r.touching)).toContain("src/cart.ts");
    const rows = (await db.query<{ id: string; state: string; retry_reason: string | null; wait_for: string | null }>("select id, state, retry_reason, wait_for from public.tasks order by id")).rows;
    expect(rows.find((r) => r.id === "t_conf_b")).toMatchObject({ state: "CREATED", retry_reason: "conflict", wait_for: "t_conf_a" });
    expect(rows.find((r) => r.id === "t_conf_a")?.state).not.toBe("CREATED");
    expect((await db.query<{ text: string }>("select text from public.task_activities where task_id = 't_conf_b' and kind = 'conflict'")).rows.map((r) => r.text)).toEqual(["src/cart.ts · t_conf_a"]);
    expect(await runDaemonOnce(d)).toBe("t_conf_b");
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.verdicts where task_id = 't_conf_b'")).rows[0]?.n).toBe(1);
  }, 1_200_000);
});
