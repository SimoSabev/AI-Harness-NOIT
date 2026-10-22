import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { capsOf, createRole, listRoles, setMemberRole, updateRole } from "./roles";
import { U, webDb } from "./web-db.test-helper";

let db: Awaited<ReturnType<typeof webDb>>;
let org = "";
beforeAll(async () => {
  db = await webDb();
  org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.members where user_id = $1", [U.owner])).rows[0]?.org_id ?? "";
});
afterAll(() => db.end());

describe("roles API (E8в, AC-8.3/8.7)", () => {
  it("capabilities of each builtin role", async () => {
    expect(await capsOf(db, U.owner, org)).toContain("roles.manage");
    expect(await capsOf(db, U.viewer, org)).toEqual(["diff.view", "docs.download"]);
  });
  it("list: the builtin roles and the members with their role; only roles.manage may list", async () => {
    const r = await listRoles(db, { uid: U.owner, org });
    expect(r.status).toBe(200);
    expect((r.body.roles as { id: string }[]).map((x) => x.id)).toEqual(expect.arrayContaining(["builtin:owner", "builtin:worker", "builtin:approver", "builtin:agent-operator", "builtin:viewer"]));
    expect((await listRoles(db, { uid: U.approver, org })).status).toBe(403);
  });
  it("create a custom 'docs reviewer' (copy of approver, scoped); ledger role_change; the viewer may not", async () => {
    const body = { name: "docs reviewer", capabilities: ["approve.level1", "approve.level2", "diff.view"], scope: { repos: null, task_types: ["docs"], level_cap: 2, budget_usd_day: null } };
    expect((await createRole(db, { uid: U.viewer, org, body })).status).toBe(403);
    const c = await createRole(db, { uid: U.owner, org, body });
    expect(c.status).toBe(201);
    const id = String(c.body.id);
    expect((await createRole(db, { uid: U.owner, org, body: { ...body, capabilities: ["root"] } })).status).toBe(400);
    expect((await createRole(db, { uid: U.owner, org, body })).status).toBe(409); // same name
    const l = await db.query<{ payload: { action: string } }>("select payload from public.ledger where kind = 'role_change' order by seq");
    expect(l.rows.map((x) => x.payload.action)).toEqual(["create"]);
    expect((await updateRole(db, { uid: U.owner, org, id, body: { ...body, capabilities: ["diff.view"] } })).status).toBe(200);
    expect((await updateRole(db, { uid: U.owner, org, id: "builtin:viewer", body })).status).toBe(403);
  });
  it("assign a role to a member (members.manage); the last member who manages roles cannot be demoted", async () => {
    const roles = (await listRoles(db, { uid: U.owner, org })).body.roles as { id: string; name: string }[];
    const docs = roles.find((x) => x.name === "docs reviewer")?.id ?? "";
    expect((await setMemberRole(db, { uid: U.approver, org, member: U.viewer, roleId: docs })).status).toBe(403);
    expect((await setMemberRole(db, { uid: U.owner, org, member: U.viewer, roleId: docs })).status).toBe(200);
    expect(await capsOf(db, U.viewer, org)).toEqual(["diff.view"]);
    expect((await setMemberRole(db, { uid: U.owner, org, member: U.owner, roleId: "builtin:viewer" })).body).toEqual({ error: "last_role_manager" });
    const l = await db.query<{ payload: { action: string } }>("select payload from public.ledger where kind = 'role_change' order by seq");
    expect(l.rows.map((x) => x.payload.action)).toEqual(["create", "update", "assign"]);
  });
});
