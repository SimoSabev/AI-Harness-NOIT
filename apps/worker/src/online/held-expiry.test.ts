import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { closeExpiredHeld, heldDays } from "./held-expiry.js";

// E8g (v5 p. 4.4): a HELD task does not wait forever. Entering HELD sets held_until (now + 7 days by default);
// the sweeper closes the overdue ones (CLOSED, wait_reason expired), writes task_stopped and notifies the org.
let db: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
});
afterAll(() => db.end());

const task = async (id: string, state: string) => {
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, 'bugfix', 'claude', 'x', 'GATED')", [id, DEMO_ORG_ID, DEMO_REPO_ID]);
  await db.query("update public.tasks set state = $2, state_entered_at = now() where id = $1", [id, state]);
};
const row = async (id: string) => (await db.query<{ state: string; wait_reason: string | null; held_until: string | null }>("select state, wait_reason, held_until::text as held_until from public.tasks where id = $1", [id])).rows[0];

describe("HELD expiry (E8g)", () => {
  it("entering HELD sets held_until ≈ now + 7 days; leaving HELD clears it", async () => {
    await task("t_held_a", "HELD");
    const r = (await db.query<{ days: number }>("select round(extract(epoch from held_until - now()) / 86400)::int as days from public.tasks where id = 't_held_a'")).rows[0];
    expect(r?.days).toBe(7);
    await db.query("update public.tasks set state = 'DELIVERED' where id = 't_held_a'");
    expect((await row("t_held_a"))?.held_until).toBeNull();
  });

  it("the sweeper closes only overdue HELD tasks: ledger task_stopped expired + web_push expired; idempotent", async () => {
    await task("t_held_old", "HELD");
    await task("t_held_new", "HELD");
    await db.query("update public.tasks set held_until = now() - interval '1 minute' where id = 't_held_old'");
    const closed = await closeExpiredHeld(db, { now: new Date() });
    expect(closed).toEqual(["t_held_old"]);
    expect(await row("t_held_old")).toMatchObject({ state: "CLOSED", wait_reason: "expired", held_until: null });
    expect((await row("t_held_new"))?.state).toBe("HELD");
    const led = (await db.query<{ payload: { reason: string } }>("select payload from public.ledger where task_id = 't_held_old' and kind = 'task_stopped'")).rows;
    expect(led.map((l) => l.payload.reason)).toEqual(["expired"]);
    const push = (await db.query<{ payload: unknown }>("select payload from public.outbox where kind = 'web_push' and payload->>'task_id' = 't_held_old'")).rows;
    expect(push.map((p) => p.payload)).toEqual([{ task_id: "t_held_old", kind: "expired" }]);
    expect(await closeExpiredHeld(db, { now: new Date() })).toEqual([]);
  });

  it("MANDAT_HELD_DAYS shortens the wait (counted from state_entered_at); bad values fall back to 7", async () => {
    expect(heldDays({ MANDAT_HELD_DAYS: "2" })).toBe(2);
    expect(heldDays({ MANDAT_HELD_DAYS: "0" })).toBe(7);
    expect(heldDays({ MANDAT_HELD_DAYS: "x" })).toBe(7);
    expect(heldDays({})).toBe(7);
    await task("t_held_env", "HELD");
    await db.query("update public.tasks set state_entered_at = now() - interval '3 days' where id = 't_held_env'");
    expect(await closeExpiredHeld(db, { now: new Date(), days: 7 })).toEqual([]);
    expect(await closeExpiredHeld(db, { now: new Date(), days: 2 })).toEqual(["t_held_env"]);
  });
});
