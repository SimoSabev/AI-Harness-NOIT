import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { createTask } from "./actions";
import { U, webDb } from "./web-db.test-helper";

// D-360: a "free" task (no scope limits) needs no task type row in the project's policy — the default scope applies.
let db: Awaited<ReturnType<typeof webDb>>;
let org = "";
beforeAll(async () => {
  db = await webDb();
  org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
});
afterAll(() => db.end());

describe("free task (D-360)", () => {
  it("is created on the org's repo although the policy defines no free type; a type the policy lacks still → 409", async () => {
    expect((await db.query("select 1 from public.task_types where name = 'free'")).rows).toHaveLength(0);
    const r = await createTask(db, { uid: U.owner, org, body: { type: "free", agent: "claude", text: "anything" } });
    expect(r.status).toBe(201);
    const id = (r.body as { id: string }).id;
    expect((await db.query<{ type: string; repo_id: string }>("select type, repo_id::text as repo_id from public.tasks where id = $1", [id])).rows[0]).toEqual({ type: "free", repo_id: DEMO_REPO_ID });
    await db.query("delete from public.task_types where name = 'css'");
    expect((await createTask(db, { uid: U.owner, org, body: { type: "css", agent: "claude", text: "x" } })).status).toBe(409);
  });
});
