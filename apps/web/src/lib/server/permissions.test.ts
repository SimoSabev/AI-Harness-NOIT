import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoProfileLayers, sealProfile } from "@mandat/contract";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { decideAsk, setPermission } from "./permissions";
import { devSecondFactor } from "./session";
import { totpAt } from "./totp";
import { TEST_TOTP, U, webDb } from "./web-db.test-helper";

// E8g (v5 p. 4.4, AC-8.1, D-352): a person decides an ask (once / always / deny); the matrix is editable (tools.manage);
// every change is a new profile version where only layer C differs; opening net:* or git push needs a fresh TOTP.
let db: Awaited<ReturnType<typeof webDb>>;
let org = "";
const C_ASK = "mcp:github.create_issue";
const task = async (id: string) => {
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2::uuid, $3::uuid, 'bugfix', 'claude', 'x', 'GATED')", [id, org, DEMO_REPO_ID]);
  await db.query("update public.tasks set state = 'HELD', wait_reason = 'tool_approval' where id = $1", [id]);
  return (await db.query<{ id: string }>("insert into public.tool_asks (org_id, task_id, attempt, tool, reason) values ($1::uuid, $2, 1, $3, 'a human decides on new issues') returning id::text as id", [org, id, C_ASK])).rows[0]?.id as string;
};
const taskRow = async (id: string) => (await db.query<{ state: string; attempt: number; wait_reason: string | null }>("select state, attempt, wait_reason from public.tasks where id = $1", [id])).rows[0];
const approvedC = async () => (await db.query<{ c: { subject: string; tool: string; decision: string }[]; version: number }>("select h.layers -> 'c' as c, h.version from public.repos r join public.harness_profiles h on h.id = r.profile_id where r.id = $1::uuid", [DEMO_REPO_ID])).rows[0];

beforeAll(async () => {
  db = await webDb();
  org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
  const p = sealProfile({ version: 1, repo_id: DEMO_REPO_ID, layers: demoProfileLayers(), sources: {}, approved_by: null, approved_at: null });
  const id = (await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 1, $3::jsonb, '{}', $4, 'approved', now()) returning id::text as id", [org, DEMO_REPO_ID, JSON.stringify(p.layers), p.profile_hash])).rows[0]?.id;
  await db.query("update public.repos set profile_id = $2::uuid where id = $1::uuid", [DEMO_REPO_ID, id]);
});
afterAll(() => db.end());

describe("ask decisions (AC-8.1)", () => {
  const sf = () => devSecondFactor(db);
  it("viewer → 403; once → a new attempt with the grant; the ask records who and when", async () => {
    const ask = await task("t_ask_once");
    expect((await decideAsk(db, { uid: U.viewer, taskId: "t_ask_once", body: { ask_id: ask, decision: "once" }, secondFactor: sf() })).status).toBe(403);
    const r = await decideAsk(db, { uid: U.approver, taskId: "t_ask_once", body: { ask_id: ask, decision: "once" }, secondFactor: sf() });
    expect(r).toMatchObject({ status: 200, body: { state: "CREATED", attempt: 2 } });
    expect(await taskRow("t_ask_once")).toMatchObject({ state: "CREATED", attempt: 2, wait_reason: null });
    expect((await db.query<{ status: string; grant_attempt: number; decided_by: string }>("select status, grant_attempt, decided_by::text as decided_by from public.tool_asks where id = $1::uuid", [ask])).rows[0]).toEqual({ status: "once", grant_attempt: 2, decided_by: U.approver });
    expect((await decideAsk(db, { uid: U.approver, taskId: "t_ask_once", body: { ask_id: ask, decision: "once" }, secondFactor: sf() })).status).toBe(409);
  });
  it("always → a tool_permissions row, a ledger row, a new layer C version (ask → allow), a new attempt", async () => {
    const before = await approvedC();
    const ask = await task("t_ask_always");
    const r = await decideAsk(db, { uid: U.approver, taskId: "t_ask_always", body: { ask_id: ask, decision: "always" }, secondFactor: sf() });
    expect(r.status).toBe(200);
    expect((await db.query("select subject, tool, decision from public.tool_permissions where tool = $1", [C_ASK])).rows).toEqual([{ subject: "agent:claude", tool: C_ASK, decision: "allow" }]);
    const after = await approvedC();
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    expect(after?.c.find((x) => x.tool === C_ASK)?.decision).toBe("allow");
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.ledger where kind = 'tool_permission'")).rows[0]?.n).toBe(1);
    expect((await taskRow("t_ask_always"))?.state).toBe("CREATED");
  });
  it("deny → the task is CLOSED (tool_denied)", async () => {
    const ask = await task("t_ask_deny");
    expect((await decideAsk(db, { uid: U.approver, taskId: "t_ask_deny", body: { ask_id: ask, decision: "deny" }, secondFactor: sf() })).status).toBe(200);
    expect(await taskRow("t_ask_deny")).toMatchObject({ state: "CLOSED", wait_reason: "tool_denied" });
  });
});

describe("the editable matrix (tools.manage)", () => {
  const sf = () => devSecondFactor(db);
  it("an approver lacks tools.manage → 403; a bad subject or tool → 400", async () => {
    expect((await setPermission(db, { uid: U.approver, org, body: { subject: "any", tool: "mcp:x.y", decision: "deny" }, secondFactor: sf() })).status).toBe(403);
  });
  it("deny → allow on net:* needs a fresh TOTP; with it a new version; tightening needs none", async () => {
    const v0 = (await approvedC())?.version ?? 0;
    expect((await setPermission(db, { uid: U.owner, org, body: { subject: "any", tool: "net:api.segment.io", decision: "allow" }, secondFactor: sf() })).body).toEqual({ error: "second_factor_required" });
    const ok = await setPermission(db, { uid: U.owner, org, body: { subject: "any", tool: "net:api.segment.io", decision: "allow", code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf() });
    expect(ok).toMatchObject({ status: 200, body: { versions: 1 } });
    expect((await approvedC())?.version).toBe(v0 + 1);
    const tighten = await setPermission(db, { uid: U.owner, org, body: { subject: "any", tool: "bash:curl *", decision: "deny" }, secondFactor: sf() });
    expect(tighten).toMatchObject({ status: 200, body: { versions: 0 } }); // already deny in layer C → no new version
    expect((await setPermission(db, { uid: U.owner, org, body: { subject: "any", tool: "path:write:docs/**", decision: "ask" }, secondFactor: sf() })).body).toEqual({ versions: 1 });
  });
});
