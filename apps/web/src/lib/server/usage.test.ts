import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { asService } from "./sql";
import { usageRows } from "./usage";
import { webDb } from "./web-db.test-helper";

// D-629: the facts behind Settings → Models → Usage — every task and conversation of the org in the window, with its spend
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
  await asService(db, async (sql) => {
    await sql.query("insert into public.tasks (id, org_id, repo_id, type, agent, model, text, state, last_result, usd, minutes, created_at) values ('t_use_new', $1::uuid, $2::uuid, 'free', 'claude@use', 'm-new', 'x', 'CLOSED', 'VERIFIED', 1.25, 3, now() - interval '1 day'), ('t_use_old', $1::uuid, $2::uuid, 'free', 'claude@use', 'm-old', 'x', 'CLOSED', null, 9, 0, now() - interval '40 days')", [DEMO_ORG_ID, DEMO_REPO_ID]);
    await sql.query("insert into public.conversations (id, org_id, repo_id, created_by, agent, model, budget_usd, expires_at, status, usd) values ('c_use', $1::uuid, $2::uuid, $3::uuid, 'claude@use', 'm-chat', 0.5, now() + interval '1 hour', 'idle', 0.4)", [DEMO_ORG_ID, DEMO_REPO_ID, DEMO_OWNER_ID]);
  });
});
afterAll(async () => db.end());

describe("usageRows (D-629)", () => {
  it("the org's tasks and conversations inside the window, with agent, model, spend, minutes and verdict", async () => {
    const rows = (await usageRows(db, DEMO_ORG_ID, 30)).filter((r) => r.agent === "claude@use");
    expect(rows.map((r) => [r.kind, r.model, r.usd, r.minutes, r.result]).sort()).toEqual([["chat", "m-chat", 0.4, 0, null], ["task", "m-new", 1.25, 3, "VERIFIED"]]);
    expect(rows.every((r) => !Number.isNaN(Date.parse(r.at)))).toBe(true);
  });
});
