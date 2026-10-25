import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { nightShiftTick } from "./night.js";

// v5 E9а (5.1, D-320): the tick of the night shift — start at starts_at, fill ≤ N slots from the queue, read each
// finished task (merged / waiting / retry with a note / parked with a question), stop only on the budget, end at
// ends_at with a report, a push and a ledger row. The shift never stops on one task.
let db: Awaited<ReturnType<typeof pgliteDb>>;
const RULES = { auto_merge: { min_level: 2, max_lines: 200 }, on_fail: "retry_then_park", retries: 1, same_file: "wait", forbid_tools: [] };
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
});
afterAll(() => db.end());

const shift = async (id: string, o: { startsIn?: number; endsIn?: number; budget?: number; status?: string } = {}) => {
  await db.query(
    `insert into public.night_shifts (id, org_id, starts_at, ends_at, budget_usd, rules, status)
     values ($1, $2, now() + make_interval(mins => $3::int), now() + make_interval(mins => $4::int), $5, $6::jsonb, $7)`,
    [id, DEMO_ORG_ID, o.startsIn ?? -1, o.endsIn ?? 480, o.budget ?? 10, JSON.stringify(RULES), o.status ?? "planned"],
  );
};
const queue = async (s: string, texts: string[]) => {
  for (const [i, text] of texts.entries()) await db.query("insert into public.night_queue (org_id, shift_id, repo_id, position, text, risk, est_minutes, est_usd) values ($1, $2, $3, $4, $5, 'low', 20, 0.5)", [DEMO_ORG_ID, s, DEMO_REPO_ID, i, text]);
};
const items = async (s: string) => (await db.query<{ position: number; status: string; task_id: string | null; note: string | null }>("select position, status, task_id, note from public.night_queue where shift_id = $1 order by position", [s])).rows;
const finish = async (task: string, state: string, result: "VERIFIED" | "FAILED" | "UNKNOWN", reasons: string[], usd = 0.2, wait: string | null = null) => {
  const a = (await db.query<{ attempt: number }>("select attempt from public.tasks where id = $1", [task])).rows[0]?.attempt ?? 1;
  await db.query("update public.tasks set state = $2, last_result = $3, usd = usd + $4, wait_reason = $5 where id = $1", [task, state, result, usd, wait]);
  await db.query("insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, reasons, base_sha, verdict_hash) values ($1, $2, $3, $4, 'full', 'claude', $5, $6::jsonb, $7, 'sha256:x')", [DEMO_ORG_ID, task, `r_${"0".repeat(25)}${a}`, a, result, JSON.stringify(reasons), "a".repeat(40)]);
};
const S1 = "50000000-0000-4000-8000-0000000000a1";

describe("night shift tick (E9а)", () => {
  it("планирана смяна тръгва в starts_at; ≤ N слота задачи от опашката (shift_id, тип, текст); повторното тиктакане не дублира", async () => {
    await shift(S1);
    await queue(S1, ["fix one", "fix two", "fix three"]);
    await nightShiftTick(db, { now: new Date(), slots: 2, agent: "fake:honest-fix" });
    expect((await db.query<{ status: string }>("select status from public.night_shifts where id = $1", [S1])).rows[0]?.status).toBe("running");
    const it1 = await items(S1);
    expect(it1.map((i) => i.status)).toEqual(["running", "running", "queued"]);
    const t = (await db.query<{ shift_id: string; type: string; text: string; agent: string; state: string }>("select shift_id::text as shift_id, type, text, agent, state from public.tasks where id = $1", [it1[0]?.task_id])).rows[0];
    expect(t).toMatchObject({ shift_id: S1, type: "bugfix", text: "fix one", agent: "fake:honest-fix", state: "CREATED" });
    await nightShiftTick(db, { now: new Date(), slots: 2, agent: "fake:honest-fix" });
    expect((await items(S1)).map((i) => i.status)).toEqual(["running", "running", "queued"]);
    expect((await db.query("select 1 from public.ledger where kind = 'night_start'")).rows).toHaveLength(1);
  });

  it("слята → merged; провал → нов опит с бележка от Мандат; втори провал → parked + въпрос, а следващата задача тръгва веднага", async () => {
    const [a, b] = (await items(S1)).map((i) => i.task_id as string);
    await finish(a as string, "CLOSED", "VERIFIED", []);
    await finish(b as string, "BLOCKED", "FAILED", ["MUST_PASS:not_passed:tests/cart.spec.ts > cart > applies 10% over 50"]);
    await nightShiftTick(db, { now: new Date(), slots: 2, agent: "fake:honest-fix" });
    expect((await items(S1)).map((i) => i.status)).toEqual(["merged", "running", "running"]);
    const tb = (await db.query<{ attempt: number; retry_reason: string; state: string }>("select attempt, retry_reason, state from public.tasks where id = $1", [b])).rows[0];
    expect(tb).toEqual({ attempt: 2, retry_reason: "night", state: "CREATED" });
    const note = (await db.query<{ text: string }>("select text from public.task_activities where task_id = $1 and kind = 'night'", [b])).rows;
    expect(note[0]?.text).toContain("does not make `tests/cart.spec.ts > cart > applies 10% over 50` pass");
    await finish(b as string, "BLOCKED", "FAILED", ["MUST_PASS:not_passed:tests/cart.spec.ts > cart > applies 10% over 50"]);
    await nightShiftTick(db, { now: new Date(), slots: 2, agent: "fake:honest-fix" });
    expect((await items(S1)).map((i) => i.status)).toEqual(["merged", "parked", "running"]);
    const q = (await db.query<{ what_stopped: string; tried: string[]; proposal: string; status: string }>("select what_stopped, tried, proposal, status from public.night_questions where task_id = $1", [b])).rows[0];
    expect(q?.what_stopped).toBe("FAILED after 2 attempt(s): `MUST_PASS:not_passed:tests/cart.spec.ts > cart > applies 10% over 50`");
    expect(q?.tried).toEqual(["attempt 1: FAILED", "attempt 2: FAILED"]);
    expect(q?.status).toBe("open");
  });

  it("нерешимо (INFRA) → parked веднага; VERIFIED, което чака човек → waiting; края → доклад, push, ledger", async () => {
    const c = (await items(S1))[2]?.task_id as string;
    await finish(c, "BLOCKED", "UNKNOWN", ["INFRA:INSTALL_BASE:-"]);
    await nightShiftTick(db, { now: new Date(), slots: 2, agent: "fake:honest-fix" });
    expect((await items(S1)).map((i) => i.status)).toEqual(["merged", "parked", "parked"]);
    await nightShiftTick(db, { now: new Date(Date.now() + 9 * 3600_000), slots: 2, agent: "fake:honest-fix" });
    const s = (await db.query<{ status: string; report: Record<string, unknown>; spent_usd: string }>("select status, report, spent_usd::text as spent_usd from public.night_shifts where id = $1", [S1])).rows[0];
    expect(s?.status).toBe("done");
    expect(s?.report).toMatchObject({ merged: 1, waiting: 0, parked: 2, failed: 0, skipped: 0 });
    expect(Number(s?.spent_usd)).toBeCloseTo(0.8, 2);
    expect((await db.query("select 1 from public.ledger where kind = 'night_done'")).rows).toHaveLength(1);
    expect((await db.query("select 1 from public.outbox where kind = 'web_push' and payload->>'kind' = 'night_report'")).rows).toHaveLength(1);
  });

  it("бюджетът: изхарченото ≥ бюджета → останалите skipped (budget), смяната свършва", async () => {
    const S2 = "50000000-0000-4000-8000-0000000000a2";
    await shift(S2, { budget: 1 });
    await queue(S2, ["one", "two", "three"]);
    await nightShiftTick(db, { now: new Date(), slots: 1, agent: "fake:honest-fix" });
    const t = (await items(S2))[0]?.task_id as string;
    await finish(t, "HELD", "VERIFIED", [], 1.5, "approval");
    await nightShiftTick(db, { now: new Date(), slots: 1, agent: "fake:honest-fix" });
    expect((await items(S2)).map((i) => [i.status, i.note])).toEqual([["waiting", null], ["skipped", "budget"], ["skipped", "budget"]]);
    expect((await db.query<{ status: string }>("select status from public.night_shifts where id = $1", [S2])).rows[0]?.status).toBe("done");
  });
});
