import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { sweepOverdue } from "./sweep.js";

// D-451 (T3-8, D-211): a task the worker no longer works on does not stay "working" forever. The sweeper takes the
// overdue ones (state_deadline_at, else state_entered_at + the state's maximum): alive → a new deadline; dead → BLOCKED.
let db: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
});
afterAll(() => db.end());

const task = async (id: string, state: string, enteredMinAgo: number) => {
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, 'bugfix', 'claude', 'x', 'CREATED')", [id, DEMO_ORG_ID, DEMO_REPO_ID]);
  await db.query("update public.tasks set state = $2, state_entered_at = now() - make_interval(mins => $3::int) where id = $1", [id, state, enteredMinAgo]);
};
const row = async (id: string) => (await db.query<{ state: string; wait_reason: string | null }>("select state, wait_reason from public.tasks where id = $1", [id])).rows[0];
const none = () => false;

describe("sweepOverdue (D-451)", () => {
  it("a dead RUNNING task past its maximum → BLOCKED runner_offline, ledger task_stopped, web_push", async () => {
    await task("t_sw_run", "RUNNING", 200);
    const out = await sweepOverdue(db, { now: new Date(), env: {}, alive: none });
    expect(out).toContainEqual({ task_id: "t_sw_run", kind: "blocked" });
    expect(await row("t_sw_run")).toEqual({ state: "BLOCKED", wait_reason: "runner_offline" });
    const led = (await db.query<{ payload: { reason: string } }>("select payload from public.ledger where task_id = 't_sw_run' and kind = 'task_stopped'")).rows;
    expect(led.map((l) => l.payload.reason)).toEqual(["runner_offline"]);
    const push = (await db.query("select 1 from public.outbox where kind = 'web_push' and payload->>'task_id' = 't_sw_run'")).rows;
    expect(push).toHaveLength(1);
  });

  it("a dead task in verify → BLOCKED infra:lease_lost; CONTRACTED left by a crash is swept too", async () => {
    await task("t_sw_ver", "VERIFY_1", 45);
    await task("t_sw_con", "CONTRACTED", 15);
    await sweepOverdue(db, { now: new Date(), env: {}, alive: none });
    expect(await row("t_sw_ver")).toEqual({ state: "BLOCKED", wait_reason: "infra:lease_lost" });
    expect(await row("t_sw_con")).toEqual({ state: "BLOCKED", wait_reason: "runner_offline" });
  });

  it("not yet overdue, or a waiting state (GATED, HELD) → untouched", async () => {
    await task("t_sw_young", "PROVISIONING", 2);
    await task("t_sw_gated", "GATED", 10_000);
    await sweepOverdue(db, { now: new Date(), env: {}, alive: none });
    expect((await row("t_sw_young"))?.state).toBe("PROVISIONING");
    expect((await row("t_sw_gated"))?.state).toBe("GATED");
  });

  it("alive (this worker still processes it) → a new deadline, state kept; MANDAT_STATE_MAX_MIN_<STATE> shortens", async () => {
    await task("t_sw_alive", "EXPORTING", 5);
    const out = await sweepOverdue(db, { now: new Date(), env: { MANDAT_STATE_MAX_MIN_EXPORTING: "1" }, alive: (id) => id === "t_sw_alive" });
    expect(out).toContainEqual({ task_id: "t_sw_alive", kind: "extend" });
    expect((await row("t_sw_alive"))?.state).toBe("EXPORTING");
    const d = (await db.query<{ ahead: boolean }>("select state_deadline_at > now() as ahead from public.tasks where id = 't_sw_alive'")).rows[0];
    expect(d?.ahead).toBe(true);
  });

  it("a stored deadline in the future wins over state_entered_at; a second sweep does nothing (idempotent)", async () => {
    await task("t_sw_kept", "RUNNING", 500);
    await db.query("update public.tasks set state_deadline_at = now() + interval '5 minutes' where id = 't_sw_kept'");
    await sweepOverdue(db, { now: new Date(), env: {}, alive: none });
    expect((await row("t_sw_kept"))?.state).toBe("RUNNING");
    const again = await sweepOverdue(db, { now: new Date(), env: {}, alive: none });
    expect(again.filter((a) => a.kind !== "extend")).toEqual([]);
  });
});
