import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { selfFinishTick } from "./self-finish.js";

// Round 1, feature 1 „Сам довършва“ (D-521): the tick that applies core's nextMove to waiting tasks. A retry is a new
// attempt (CREATED, retry_reason auto/ci) with Mandat's own note and a task_retry ledger row (by mandat); a wait does
// nothing until its time; "ask" leaves the task to the person. Night-shift tasks belong to the night tick.
let db: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
});
afterAll(() => db.end());

const task = async (id: string, o: { state: string; wait?: string | null; result?: string | null; reasons?: string[]; minsAgo?: number; shift?: boolean }) => {
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, 'bugfix', 'claude', 'x', 'GATED')", [id, DEMO_ORG_ID, DEMO_REPO_ID]);
  await db.query("update public.tasks set state = $2, wait_reason = $3, last_result = $4, state_entered_at = now() - make_interval(mins => $5::int) where id = $1", [id, o.state, o.wait ?? null, o.result ?? null, o.minsAgo ?? 60]);
  if (o.result) await db.query("insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, reasons, base_sha, verdict_hash) values ($1, $2, $3, 1, 'full', 'claude', $4, $5::jsonb, $6, 'sha256:x')", [DEMO_ORG_ID, id, `r_${"0".repeat(25)}1`, o.result, JSON.stringify(o.reasons ?? []), "a".repeat(40)]);
};
const row = async (id: string) => (await db.query<{ state: string; attempt: number; retry_reason: string | null; wait_reason: string | null }>("select state, attempt, retry_reason, wait_reason from public.tasks where id = $1", [id])).rows[0];
const notes = async (id: string) => (await db.query<{ text: string }>("select text from public.task_activities where task_id = $1 and kind = 'self' order by id", [id])).rows.map((r) => r.text);
const retries = async (id: string) => (await db.query<{ payload: { by: string; reason: string; why: string; attempt: number } }>("select payload from public.ledger where task_id = $1 and kind = 'task_retry' order by seq", [id])).rows.map((r) => r.payload);

describe("selfFinishTick (D-521)", () => {
  it("an overloaded agent after the backoff → a new attempt with Mandat's note and a ledger row; the next tick does not repeat it", async () => {
    await task("t_sf_over", { state: "HELD", wait: "agent_failed:overloaded" });
    const r = await selfFinishTick(db, { now: new Date() });
    expect(r.retried).toContain("t_sf_over");
    expect(await row("t_sf_over")).toEqual({ state: "CREATED", attempt: 2, retry_reason: "auto", wait_reason: null });
    expect((await notes("t_sf_over"))[0]).toContain("agent_failed:overloaded");
    expect(await retries("t_sf_over")).toEqual([{ attempt: 2, reason: "auto", why: "agent_failed:overloaded", by: "mandat" }]);
    await selfFinishTick(db, { now: new Date() });
    expect((await row("t_sf_over"))?.attempt).toBe(2);
  });

  it("a FAILED task → a new attempt whose note says what stopped it and the proposal by class", async () => {
    await task("t_sf_fail", { state: "BLOCKED", result: "FAILED", reasons: ["D2:missing_test:tests/cart.spec.ts > cart > a"] });
    await selfFinishTick(db, { now: new Date() });
    expect((await row("t_sf_fail"))?.state).toBe("CREATED");
    expect((await notes("t_sf_fail"))[0]).toContain("Restore the test `tests/cart.spec.ts > cart > a`");
  });

  it("before the backoff it waits; a person's wait, a stop and a night task are left alone", async () => {
    await task("t_sf_soon", { state: "HELD", wait: "no_channel", minsAgo: 1 });
    await task("t_sf_appr", { state: "HELD", wait: "approval", result: "VERIFIED" });
    await task("t_sf_stop", { state: "BLOCKED", wait: "stopped", result: "FAILED", reasons: ["D2:missing_test:t"] });
    await task("t_sf_night", { state: "BLOCKED", result: "FAILED", reasons: ["D2:missing_test:t"] });
    await db.query("insert into public.night_shifts (id, org_id, starts_at, ends_at, budget_usd, rules, status) values ('50000000-0000-4000-8000-0000000000f1', $1, now(), now() + interval '1 hour', 1, '{}'::jsonb, 'running')", [DEMO_ORG_ID]);
    await db.query("update public.tasks set shift_id = '50000000-0000-4000-8000-0000000000f1' where id = 't_sf_night'");
    const r = await selfFinishTick(db, { now: new Date() });
    for (const id of ["t_sf_soon", "t_sf_appr", "t_sf_stop", "t_sf_night"]) {
      expect(r.retried).not.toContain(id);
      expect((await row(id))?.attempt).toBe(1);
    }
    expect(r.waiting).toContain("t_sf_soon");
  });

  it("the cap: after two attempts Mandat started alone, the third wait is the person's", async () => {
    await task("t_sf_cap", { state: "HELD", wait: "base_moved" });
    await selfFinishTick(db, { now: new Date() });
    await db.query("update public.tasks set state = 'HELD', wait_reason = 'base_moved' where id = 't_sf_cap'");
    await selfFinishTick(db, { now: new Date() });
    await db.query("update public.tasks set state = 'HELD', wait_reason = 'base_moved' where id = 't_sf_cap'");
    const r = await selfFinishTick(db, { now: new Date() });
    expect(r.retried).not.toContain("t_sf_cap");
    expect((await row("t_sf_cap"))?.attempt).toBe(3);
  });

  it("ci_failed → „Fix CI“ (retry_reason ci) while rounds are left", async () => {
    await task("t_sf_ci", { state: "HELD", wait: "ci_failed" });
    await selfFinishTick(db, { now: new Date() });
    expect(await row("t_sf_ci")).toMatchObject({ state: "CREATED", retry_reason: "ci" });
    expect((await retries("t_sf_ci"))[0]).toMatchObject({ reason: "ci", by: "mandat" });
  });
});
