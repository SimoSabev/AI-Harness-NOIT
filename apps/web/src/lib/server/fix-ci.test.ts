import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { fixCiTask } from "./actions";
import { U, webDb } from "./web-db.test-helper";

// E8g (v5 p. 4.7 (3), AC-9.2): "Fix CI" — an approver starts a new attempt with the CI log; after ci_rounds failed rounds → 409.
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
  const org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, wait_reason, ci_rounds) values ('t_fixci', $1::uuid, $2::uuid, 'bugfix', 'claude', 'x', 'HELD', 'ci_failed', 1), ('t_fixci2', $1::uuid, $2::uuid, 'bugfix', 'claude', 'x', 'HELD', 'ci_failed', 2)", [org, DEMO_REPO_ID]);
});
afterAll(() => db.end());

describe("Fix CI (AC-9.2)", () => {
  it("viewer → 403; approver → a new attempt; rounds used up → 409; not a CI failure → 409", async () => {
    expect((await fixCiTask(db, { uid: U.viewer, taskId: "t_fixci" })).status).toBe(403);
    expect(await fixCiTask(db, { uid: U.approver, taskId: "t_fixci" })).toMatchObject({ status: 200, body: { state: "CREATED", attempt: 2 } });
    expect((await db.query("select retry_reason from public.tasks where id = 't_fixci'")).rows[0]).toEqual({ retry_reason: "ci" });
    expect(await fixCiTask(db, { uid: U.approver, taskId: "t_fixci2" })).toMatchObject({ status: 409, body: { error: "ci_rounds_exhausted" } });
    expect((await fixCiTask(db, { uid: U.approver, taskId: "t_fixci" })).status).toBe(409);
  });
});
