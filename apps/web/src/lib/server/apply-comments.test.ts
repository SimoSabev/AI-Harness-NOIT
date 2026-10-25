import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { applyComments } from "./actions";
import { U, webDb } from "./web-db.test-helper";

// E8g (v5 p. 4.7 (4)): review comments on the PR never reach the agent by themselves. An approver pastes the ones to act
// on; they are stored and a new attempt starts with them in its contract (framed as PR comments).
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
  const org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, wait_reason, last_result) values ('t_rev', $1::uuid, $2::uuid, 'bugfix', 'claude', 'x', 'HELD', 'approval', 'VERIFIED')", [org, DEMO_REPO_ID]);
});
afterAll(() => db.end());

describe("Apply comments", () => {
  it("viewer → 403; approver → stored as review notes and a new attempt; empty → 400", async () => {
    expect((await applyComments(db, { uid: U.viewer, taskId: "t_rev", text: "rename x" })).status).toBe(403);
    expect((await applyComments(db, { uid: U.approver, taskId: "t_rev", text: "  " })).status).toBe(400);
    expect(await applyComments(db, { uid: U.approver, taskId: "t_rev", text: "Rename `x` to `total`" })).toMatchObject({ status: 200, body: { state: "CREATED", attempt: 2 } });
    expect((await db.query("select kind, text from public.task_activities where task_id = 't_rev'")).rows).toEqual([{ kind: "review", text: "Rename `x` to `total`" }]);
  });
});
