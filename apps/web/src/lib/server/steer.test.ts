import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { steerTask } from "./steer";
import { U, webDb } from "./web-db.test-helper";

// E8g (v5 p. 4.4 (3), AC-8.5): "Steer" stores the text (task.steer); the worker delivers it to a live steerable agent,
// otherwise it goes into the next attempt's contract. A finished task cannot be steered.
let db: Awaited<ReturnType<typeof webDb>>;
let org = "";
beforeAll(async () => {
  db = await webDb();
  org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, steerable) values ('t_steer', $1::uuid, $2::uuid, 'bugfix', 'claude', 'x', 'RUNNING', true), ('t_steer_done', $1::uuid, $2::uuid, 'bugfix', 'claude', 'x', 'CLOSED', false)", [org, DEMO_REPO_ID]);
});
afterAll(() => db.end());

describe("steer (AC-8.5)", () => {
  it("viewer → 403; owner → stored with the author; live = the agent takes it now", async () => {
    expect((await steerTask(db, { uid: U.viewer, taskId: "t_steer", text: "use cents" })).status).toBe(403);
    const r = await steerTask(db, { uid: U.owner, taskId: "t_steer", text: "use cents" });
    expect(r).toMatchObject({ status: 200, body: { live: true } });
    expect((await db.query("select kind, text, by_user::text as by_user from public.task_activities where task_id = 't_steer'")).rows).toEqual([{ kind: "steer", text: "use cents", by_user: U.owner }]);
  });
  it("a closed task → 409; an empty or too long text → 400", async () => {
    expect((await steerTask(db, { uid: U.owner, taskId: "t_steer_done", text: "x" })).status).toBe(409);
    expect((await steerTask(db, { uid: U.owner, taskId: "t_steer", text: "   " })).status).toBe(400);
    expect((await steerTask(db, { uid: U.owner, taskId: "t_steer", text: "x".repeat(501) })).status).toBe(400);
  });
});
