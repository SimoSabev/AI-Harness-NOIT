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

// D-387: the project picker in the task box — the task goes to the chosen repo of the org, never to another org's.
describe("the chosen project (D-387)", () => {
  it("a second repo of the org gets the task; a repo of no org or another org → 404", async () => {
    const second = "d0000000-0000-4000-8000-0000000000b9";
    await db.query("insert into public.repos (id, org_id, provider, full_name, remote_url, default_branch) values ($1, $2, 'local', 'me/second', 'file:///tmp/none.git', 'main') on conflict (id) do nothing", [second, org]);
    const r = await createTask(db, { uid: U.owner, org, body: { type: "free", agent: "claude", text: "on the second", repo: second } });
    expect(r.status).toBe(201);
    expect((await db.query<{ repo_id: string }>("select repo_id::text as repo_id from public.tasks where id = $1", [(r.body as { id: string }).id])).rows[0]?.repo_id).toBe(second);
    expect((await createTask(db, { uid: U.owner, org, body: { type: "free", agent: "claude", text: "x", repo: "d0000000-0000-4000-8000-0000000000ff" } })).status).toBe(404);
  });
});
