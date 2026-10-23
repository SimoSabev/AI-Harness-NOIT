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
import { nightShiftTick } from "./night.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";

// v5 E9а (5.1, AC-4.4 with parking): a night of two tasks on real sandboxes and real Postgres, one slot. The first task's
// agent always fails (fake:delete-test → FAILED D2:missing_test): attempt 1, Mandat's retry, attempt 2 → parked with a
// question; the second task starts in the same tick and runs to a verdict; the shift ends with a report.
const NAME = `mandat-pgnight-${process.pid}`;
const docker = (...a: string[]) => spawnSync("docker", a, { encoding: "utf8" });
let db: Db;
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-night-"));
const SHIFT = "50000000-0000-4000-8000-0000000000e1";
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
  const rules = { auto_merge: { min_level: 2, max_lines: 200 }, on_fail: "retry_then_park", retries: 1, same_file: "wait", forbid_tools: [] };
  await db.query("insert into public.night_shifts (id, org_id, starts_at, ends_at, budget_usd, rules) values ($1, $2, now() - interval '1 minute', now() + interval '2 hours', 5, $3::jsonb)", [SHIFT, DEMO_ORG_ID, JSON.stringify(rules)]);
  for (const [i, text] of ["Fix the discount (the agent fails)", "Fix the discount"].entries()) {
    await db.query("insert into public.night_queue (org_id, shift_id, repo_id, position, text, risk, est_minutes, est_usd) values ($1, $2, $3, $4, $5, 'low', 10, 0.1)", [DEMO_ORG_ID, SHIFT, DEMO_REPO_ID, i, text]);
  }
}, 180_000);
afterAll(async () => {
  await db?.end();
  docker("rm", "-f", NAME);
});

const items = async () => (await db.query<{ status: string; task_id: string | null }>("select status, task_id from public.night_queue where shift_id = $1 order by position", [SHIFT])).rows;

describe("night shift with parking (docker)", () => {
  it("fails twice → parked with a question; the next task starts at once and gets a verdict; the shift ends with a report", async () => {
    const d: DaemonDeps = { db, home, gh: fakeGitHub({ repos: { "mandat-demo/shop": {} } }), ghRepo: "mandat-demo/shop" };
    const tick = () => nightShiftTick(db, { now: new Date(), slots: 1, agent: "fake:delete-test" });
    await tick();
    const first = (await items())[0]?.task_id as string;
    expect(await runDaemonOnce(d)).toBe(first); // attempt 1: FAILED
    await tick(); // → a retry with Mandat's note
    expect((await db.query<{ attempt: number; retry_reason: string }>("select attempt, retry_reason from public.tasks where id = $1", [first])).rows[0]).toEqual({ attempt: 2, retry_reason: "night" });
    expect(await runDaemonOnce(d)).toBe(first); // attempt 2: FAILED again
    const parked = await tick(); // → parked, and the second task starts in the same tick
    expect(parked.parked).toEqual([first]);
    const it2 = await items();
    expect(it2.map((i) => i.status)).toEqual(["parked", "running"]);
    const q = (await db.query<{ what_stopped: string; tried: string[]; proposal: string }>("select what_stopped, tried, proposal from public.night_questions where task_id = $1", [first])).rows[0];
    expect(q?.what_stopped).toMatch(/^FAILED after 2 attempt\(s\): `D2:missing_test:/);
    expect(q?.tried).toEqual(["attempt 1: FAILED", "attempt 2: FAILED"]);
    expect(q?.proposal).toMatch(/^Restore the test `/);
    const second = it2[1]?.task_id as string;
    await db.query("update public.tasks set agent = 'fake:honest-fix' where id = $1", [second]);
    expect(await runDaemonOnce(d)).toBe(second);
    const done = await tick();
    expect(done.done).toEqual([SHIFT]);
    const s = (await db.query<{ status: string; report: Record<string, number> }>("select status, report from public.night_shifts where id = $1", [SHIFT])).rows[0];
    expect(s?.status).toBe("done");
    expect(s?.report).toMatchObject({ waiting: 1, parked: 1, merged: 0 });
  }, 900_000);
});
