import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { asService } from "./sql";
import { switchAccount } from "./switch-account";
import { U, webDb } from "./web-db.test-helper";

// D-628: "Continue with another account" — a task its subscription's limit holds starts again now with another agent
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
  await asService(db, async (sql) => {
    for (const [id, state, wait] of [["t_sw_lim", "HELD", "channel_limit"], ["t_sw_rev", "HELD", "approval"]] as const) {
      await sql.query("insert into public.tasks (id, org_id, repo_id, type, agent, model, text, state, wait_reason) values ($1, $2::uuid, $3::uuid, 'free', 'claude@lichno', 'old-model', 'x', $4, $5)", [id, DEMO_ORG_ID, DEMO_REPO_ID, state, wait]);
    }
  });
});
afterAll(async () => db.end());
const targets = [{ id: "claude@lichno-2", label: "Claude · b@x", models: ["claude-opus-5-5"], defaultModel: "claude-opus-5-5", local: false, limitedUntil: null }];
const row = async (id: string) => (await asService(db, (sql) => sql.query<{ state: string; agent: string; model: string | null; attempt: number; wait_reason: string | null }>("select state, agent, model, attempt, wait_reason from public.tasks where id = $1", [id]))).rows[0];

describe("switchAccount (D-628)", () => {
  it("starts the held task again with the chosen account and its model, and writes who switched to the ledger", async () => {
    const before = await row("t_sw_lim");
    const r = await switchAccount(db, { uid: U.approver, taskId: "t_sw_lim", agent: "claude@lichno-2", targets });
    expect(r.status).toBe(200);
    expect(await row("t_sw_lim")).toMatchObject({ state: "CREATED", agent: "claude@lichno-2", model: "claude-opus-5-5", wait_reason: null, attempt: (before?.attempt ?? 0) + 1 });
    const l = (await asService(db, (sql) => sql.query<{ payload: { from: string; to: string } }>("select payload from public.ledger where task_id = 't_sw_lim' and kind = 'channel_manual_switch'"))).rows;
    expect(l.map((x) => [x.payload.from, x.payload.to])).toEqual([["claude@lichno", "claude@lichno-2"]]);
  });
  it("refuses a task not held by a limit, an account not offered, a viewer, an unknown task", async () => {
    expect((await switchAccount(db, { uid: U.approver, taskId: "t_sw_rev", agent: "claude@lichno-2", targets })).body).toEqual({ error: "not_at_limit" });
    await asService(db, (sql) => sql.query("update public.tasks set state = 'HELD', wait_reason = 'channel_limit' where id = 't_sw_rev'"));
    expect((await switchAccount(db, { uid: U.approver, taskId: "t_sw_rev", agent: "codex", targets })).body).toEqual({ error: "unknown_agent" });
    expect((await switchAccount(db, { uid: U.viewer, taskId: "t_sw_rev", agent: "claude@lichno-2", targets })).status).toBe(403);
    expect((await switchAccount(db, { uid: U.approver, taskId: "t_nope", agent: "claude@lichno-2", targets })).status).toBe(404);
  });
});
