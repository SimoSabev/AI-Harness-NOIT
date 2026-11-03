import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { taskDetail } from "./queries";
import { U, webDb } from "./web-db.test-helper";

// D-452: a new attempt (retry, CI round, night) shows its own verdict and change, never the previous attempt's
// as if it were current; until the new attempt has one, there is none.
let db: Awaited<ReturnType<typeof webDb>>;
let org = "";
beforeAll(async () => {
  db = await webDb();
  org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.tasks where id = 't_seed_bugfix'")).rows[0]?.org_id as string;
});
afterAll(async () => db.end());

describe("the task page shows the current attempt (D-452)", () => {
  it("attempt 1 has a verdict and a change; attempt 2 running → neither until it has its own", async () => {
    const before = await taskDetail(db, U.approver, org, "approver", "t_seed_bugfix");
    expect(before?.task.verdict_id).not.toBeNull();
    expect(before?.task.changeset_id).not.toBeNull();
    await db.query("update public.tasks set attempt = attempt + 1, state = 'RUNNING', wait_reason = null where id = 't_seed_bugfix'");
    const after = await taskDetail(db, U.approver, org, "approver", "t_seed_bugfix");
    expect(after?.task.state).toBe("RUNNING");
    expect(after?.task.verdict_id).toBeNull();
    expect(after?.task.changeset_id).toBeNull();
    expect(after?.task.reasons).toEqual([]);
    expect(after?.evidence).toEqual([]);
    expect(after?.diff).toBeNull();
  });
});
