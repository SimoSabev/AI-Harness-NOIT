import { Capability, RoleScope, jcs, sha256Tag } from "@mandat/contract";
import { z } from "zod";
import { asService, asUser } from "./sql";
import type { Db, Sql } from "./sql";

// E8в (v5 т. 4.3, D-315/D-349): roles are data. Every check goes through private.has_cap (capabilities + scope), never
// through the role name; every change is a ledger row `role_change`.
type Res = { status: number; body: Record<string, unknown> };
const err = (status: number, error: string): Res => ({ status, body: { error } });

export const RoleBody = z
  .object({ name: z.string().trim().min(1).max(40), capabilities: z.array(Capability).max(Capability.options.length), scope: RoleScope })
  .strict();

export async function hasCap(db: Db, uid: string, org: string, cap: Capability, o: { repo?: string | null; type?: string | null; level?: number | null } = {}): Promise<boolean> {
  return asUser(db, uid, async (sql) => (await sql.query<{ ok: boolean }>("select private.has_cap($1::uuid, $2, $3::uuid, $4, $5) as ok", [org, cap, o.repo ?? null, o.type ?? null, o.level ?? null])).rows[0]?.ok === true);
}

/** The capabilities of the user's role in the org (sorted). */
export async function capsOf(db: Db, uid: string, org: string): Promise<Capability[]> {
  const r = await asUser(db, uid, (sql) => sql.query<{ capabilities: string[] }>("select r.capabilities from public.members m join public.roles r on r.id = m.role_id where m.org_id = $1::uuid and m.user_id = auth.uid()", [org]));
  return (r.rows[0]?.capabilities ?? []).filter((c): c is Capability => (Capability.options as readonly string[]).includes(c)).sort();
}

async function ledger(sql: Sql, org: string, payload: Record<string, unknown>): Promise<void> {
  const text = jcs(payload);
  await sql.query("select private.ledger_append($1::uuid, 'role_change', null, $2, $3)", [org, text, sha256Tag(text)]);
}

export async function listRoles(db: Db, o: { uid: string; org: string }): Promise<Res> {
  if (!(await hasCap(db, o.uid, o.org, "roles.manage")) && !(await hasCap(db, o.uid, o.org, "members.manage"))) return err(403, "no_capability");
  return asUser(db, o.uid, async (sql) => {
    const roles = (await sql.query<{ id: string; name: string; builtin: boolean; capabilities: string[]; scope: unknown }>("select id, name, builtin, capabilities, scope from public.roles where org_id is null or org_id = $1::uuid order by builtin desc, name", [o.org])).rows;
    const members = (await sql.query<{ user_id: string; email: string | null; role_id: string }>("select m.user_id::text as user_id, u.email, m.role_id from public.members m left join auth.users u on u.id = m.user_id where m.org_id = $1::uuid order by m.created_at", [o.org]).catch(() => ({ rows: [] }))).rows;
    return { status: 200, body: { roles, members } };
  });
}

export async function createRole(db: Db, o: { uid: string; org: string; body: unknown }): Promise<Res> {
  if (!(await hasCap(db, o.uid, o.org, "roles.manage"))) return err(403, "no_capability");
  const b = RoleBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_role");
  return asService(db, async (sql) => {
    const dup = await sql.query("select 1 from public.roles where (org_id = $1::uuid or org_id is null) and lower(name) = lower($2)", [o.org, b.data.name]);
    if (dup.rows.length > 0) return err(409, "name_taken");
    const r = await sql.query<{ id: string }>("insert into public.roles (id, org_id, name, builtin, capabilities, scope) values (gen_random_uuid()::text, $1::uuid, $2, false, $3, $4::jsonb) returning id", [o.org, b.data.name, b.data.capabilities, JSON.stringify(b.data.scope)]);
    const id = r.rows[0]?.id as string;
    await ledger(sql, o.org, { action: "create", by: o.uid, role_id: id, name: b.data.name, capabilities: [...b.data.capabilities].sort(), scope: b.data.scope });
    return { status: 201, body: { id } };
  });
}

export async function updateRole(db: Db, o: { uid: string; org: string; id: string; body: unknown }): Promise<Res> {
  if (!(await hasCap(db, o.uid, o.org, "roles.manage"))) return err(403, "no_capability");
  if (o.id.startsWith("builtin:")) return err(403, "builtin_read_only");
  const b = RoleBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_role");
  return asService(db, async (sql) => {
    const u = await sql.query("update public.roles set name = $3, capabilities = $4, scope = $5::jsonb where id = $1 and org_id = $2::uuid returning id", [o.id, o.org, b.data.name, b.data.capabilities, JSON.stringify(b.data.scope)]);
    if (u.rows.length === 0) return err(404, "unknown_role");
    await ledger(sql, o.org, { action: "update", by: o.uid, role_id: o.id, name: b.data.name, capabilities: [...b.data.capabilities].sort(), scope: b.data.scope });
    return { status: 200, body: { id: o.id } };
  });
}

export async function setMemberRole(db: Db, o: { uid: string; org: string; member: string; roleId: string }): Promise<Res> {
  if (!(await hasCap(db, o.uid, o.org, "members.manage"))) return err(403, "no_capability");
  return asService(db, async (sql) => {
    const role = (await sql.query<{ id: string }>("select id from public.roles where id = $1 and (org_id is null or org_id = $2::uuid)", [o.roleId, o.org])).rows[0];
    if (!role) return err(404, "unknown_role");
    // the org keeps at least one member who can manage roles
    const managers = (await sql.query<{ user_id: string }>("select m.user_id::text as user_id from public.members m join public.roles r on r.id = m.role_id where m.org_id = $1::uuid and 'roles.manage' = any (r.capabilities)", [o.org])).rows.map((x) => x.user_id);
    const keeps = (await sql.query<{ ok: boolean }>("select 'roles.manage' = any (capabilities) as ok from public.roles where id = $1", [o.roleId])).rows[0]?.ok === true;
    if (managers.length === 1 && managers[0] === o.member && !keeps) return err(409, "last_role_manager");
    const u = await sql.query("update public.members set role_id = $3 where org_id = $1::uuid and user_id = $2::uuid returning user_id", [o.org, o.member, o.roleId]);
    if (u.rows.length === 0) return err(404, "unknown_member");
    await ledger(sql, o.org, { action: "assign", by: o.uid, member: o.member, role_id: o.roleId });
    return { status: 200, body: { member: o.member, role_id: o.roleId } };
  });
}
