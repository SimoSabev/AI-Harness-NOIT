import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { answerQuestion, closeQuestion, planNight } from "./night";
import { U, webDb } from "./web-db.test-helper";

// v5 E9а (5.1 (2)): a person plans the night (queue, rules, budget) and in the morning answers a parked task's question
// ("Answer and continue" → a new attempt with the answer as a person's note) or closes it. night.manage only.
let db: Awaited<ReturnType<typeof webDb>>;
let org = "";
const RULES = { auto_merge: { min_level: 2, max_lines: 200 }, on_fail: "retry_then_park", retries: 1, same_file: "wait", forbid_tools: ["bash:curl *"] };
const plan = (extra: Record<string, unknown> = {}) => ({
  starts_at: new Date(Date.now() + 3600_000).toISOString(), ends_at: new Date(Date.now() + 9 * 3600_000).toISOString(), budget_usd: 10, rules: RULES,
  queue: [{ repo_id: DEMO_REPO_ID, text: "fix one", type: "free", risk: "low", est_minutes: 20, est_usd: 0.5 }, { repo_id: DEMO_REPO_ID, text: "fix two", risk: "medium", est_minutes: 30, est_usd: 1 }],
  ...extra,
});
beforeAll(async () => {
  db = await webDb();
  org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
});
afterAll(() => db.end());

describe("night (E9а)", () => {
  it("plan: viewer → 403; bad body → 400; owner → a planned shift with its queue in order; a second plan while one is open → 409", async () => {
    expect((await planNight(db, { uid: U.viewer, org, body: plan() })).status).toBe(403);
    expect((await planNight(db, { uid: U.owner, org, body: plan({ budget_usd: -1 }) })).status).toBe(400);
    expect((await planNight(db, { uid: U.owner, org, body: plan({ ends_at: new Date(Date.now() - 1000).toISOString() }) })).status).toBe(400);
    const r = await planNight(db, { uid: U.owner, org, body: plan() });
    expect(r.status).toBe(201);
    const id = (r.body as { id: string }).id;
    expect((await db.query("select status, budget_usd::float8 as budget from public.night_shifts where id = $1::uuid", [id])).rows).toEqual([{ status: "planned", budget: 10 }]);
    expect((await db.query("select position, text, type, status from public.night_queue where shift_id = $1::uuid order by position", [id])).rows).toEqual([
      { position: 0, text: "fix one", type: "free", status: "queued" },
      { position: 1, text: "fix two", type: "bugfix", status: "queued" },
    ]);
    expect((await planNight(db, { uid: U.owner, org, body: plan() })).status).toBe(409);
  });

  it("answer and continue: the question is answered, the answer is a person's note, the task gets a new attempt; closing → the task is closed", async () => {
    const shift = (await db.query<{ id: string }>("select id::text as id from public.night_shifts limit 1")).rows[0]?.id as string;
    await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, attempt, shift_id) values ('t_park_a', $1::uuid, $2::uuid, 'bugfix', 'claude', 'x', 'BLOCKED', 2, $3::uuid), ('t_park_b', $1::uuid, $2::uuid, 'bugfix', 'claude', 'y', 'BLOCKED', 2, $3::uuid)", [org, DEMO_REPO_ID, shift]);
    const q = async (task: string) => (await db.query<{ id: string }>("insert into public.night_questions (org_id, shift_id, task_id, what_stopped, tried, proposal) values ($1::uuid, $2::uuid, $3, 'FAILED', '[]', 'p') returning id::text as id", [org, shift, task])).rows[0]?.id as string;
    const qa = await q("t_park_a");
    const qb = await q("t_park_b");
    expect((await answerQuestion(db, { uid: U.viewer, id: qa, answer: "use cents" })).status).toBe(403);
    expect((await answerQuestion(db, { uid: U.owner, id: qa, answer: "  " })).status).toBe(400);
    expect((await answerQuestion(db, { uid: U.owner, id: qa, answer: "use cents" })).status).toBe(200);
    expect((await db.query("select status, answer, answered_by::text as by from public.night_questions where id = $1::uuid", [qa])).rows).toEqual([{ status: "answered", answer: "use cents", by: U.owner }]);
    expect((await db.query("select state, attempt, retry_reason from public.tasks where id = 't_park_a'")).rows).toEqual([{ state: "CREATED", attempt: 3, retry_reason: "human" }]);
    expect((await db.query("select kind, text, by_user::text as by from public.task_activities where task_id = 't_park_a'")).rows).toEqual([{ kind: "steer", text: "use cents", by: U.owner }]);
    expect((await answerQuestion(db, { uid: U.owner, id: qa, answer: "again" })).status).toBe(409);
    expect((await closeQuestion(db, { uid: U.owner, id: qb })).status).toBe(200);
    expect((await db.query("select status from public.night_questions where id = $1::uuid", [qb])).rows).toEqual([{ status: "closed" }]);
    expect((await db.query("select state, wait_reason from public.tasks where id = 't_park_b'")).rows).toEqual([{ state: "CLOSED", wait_reason: "parked_closed" }]);
  });
});
