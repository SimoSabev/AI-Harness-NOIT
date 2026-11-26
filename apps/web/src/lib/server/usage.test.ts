import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jcs, sha256Tag } from "@mandat/contract";
import { DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { asService } from "./sql";
import { accountWindows, usageRows } from "./usage";
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

describe("accountWindows (D-647)", () => {
  it("the newest limit_windows per agent of the org; a broken payload does not count", async () => {
    const w = (used: number) => [{ id: "seven_day", minutes: 10080, used, resets_at: "2026-12-01T09:00:00.000Z", status: "allowed" }];
    const put = async (org: string, payload: unknown) => {
      const text = jcs(payload);
      await asService(db, (sql) => sql.query("select private.ledger_append($1::uuid, 'limit_windows', null, $2, $3)", [org, text, sha256Tag(text)]));
    };
    await put(DEMO_ORG_ID, { agent: "claude@win", at: "2026-11-26T09:00:00.000Z", windows: w(0.2) });
    await put(DEMO_ORG_ID, { agent: "claude@win", at: "2026-11-26T10:00:00.000Z", windows: w(0.3) });
    await put(DEMO_ORG_ID, { agent: "claude@bad", at: "2026-11-26T10:00:00.000Z", windows: "nope" });
    const got = await accountWindows(db, DEMO_ORG_ID);
    expect(got["claude@win"]?.windows[0]?.used).toBe(0.3);
    expect(got["claude@bad"]).toBeUndefined();
  });
});
