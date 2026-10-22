import { z } from "zod";
import { OrgId, TaskType } from "./schemas.js";

// v5 2.3 / D-315: roles are data with capabilities and a scope; RLS and the route handlers ask has_cap, never the role name.
export const Capability = z.enum([
  "task.create",
  "task.stop",
  "task.retry",
  "task.steer",
  "approve.level1",
  "approve.level2",
  "approve.rules",
  "approve.tool",
  "keys.manage",
  "accounts.manage",
  "tools.manage",
  "roles.manage",
  "projects.manage",
  "projects.delete",
  "night.manage",
  "research.ask",
  "research.manage",
  "docs.download",
  "diff.view",
  "ledger.export",
  "settings.manage",
  "members.manage",
]);
export type Capability = z.infer<typeof Capability>;
export const RoleScope = z
  .object({
    repos: z.array(z.string().uuid()).nullable(),
    task_types: z.array(TaskType).nullable(),
    level_cap: z.number().int().min(0).max(3).nullable(),
    budget_usd_day: z.number().positive().nullable(),
  })
  .strict();
export type RoleScope = z.infer<typeof RoleScope>;
export const BuiltinRoleName = z.enum(["owner", "worker", "approver", "agent-operator", "viewer"]);
export type BuiltinRoleName = z.infer<typeof BuiltinRoleName>;
export const Role = z
  .object({
    id: z.union([z.string().uuid(), z.string().regex(/^builtin:(owner|worker|approver|agent-operator|viewer)$/)]),
    org_id: OrgId,
    name: z.string().min(1).max(40),
    builtin: z.boolean(),
    capabilities: z.array(Capability).max(Capability.options.length),
    scope: RoleScope,
  })
  .strict()
  .refine((r) => new Set(r.capabilities).size === r.capabilities.length, { message: "duplicate capability" });
export type Role = z.infer<typeof Role>;

const ALL = Capability.options;
/** „Опасно“ (D-308 (5)): everything the worker role does not have. */
export const DANGEROUS: ReadonlySet<Capability> = new Set<Capability>(["keys.manage", "accounts.manage", "roles.manage", "members.manage", "projects.delete", "approve.level2", "approve.rules", "settings.manage"]);
const CAPS: Record<BuiltinRoleName, readonly Capability[]> = {
  owner: ALL,
  worker: ALL.filter((c) => !DANGEROUS.has(c)),
  approver: ["task.create", "task.stop", "task.retry", "approve.level1", "approve.level2", "approve.tool", "diff.view", "docs.download", "research.ask"],
  "agent-operator": ["task.create", "task.stop", "task.retry", "task.steer", "diff.view", "research.ask"],
  viewer: ["diff.view", "docs.download"],
};
const NO_SCOPE: RoleScope = { repos: null, task_types: null, level_cap: null, budget_usd_day: null };
export const BUILTIN_ROLES: readonly Role[] = BuiltinRoleName.options.map((n) =>
  Role.parse({ id: `builtin:${n}`, org_id: "o_local", name: n, builtin: true, capabilities: [...CAPS[n]], scope: NO_SCOPE }),
);
export function builtinRole(n: BuiltinRoleName): Role {
  const r = BUILTIN_ROLES.find((x) => x.name === n);
  if (!r) throw new Error(`no builtin role ${n}`);
  return r;
}

export interface CapContext {
  repo_id?: string | null;
  task_type?: TaskType | null;
  level?: number | null;
}
/** The pure twin of private.has_cap: the capability plus every scope limit that the context names. */
export function roleCan(role: Role, cap: Capability, ctx: CapContext): boolean {
  if (!role.capabilities.includes(cap)) return false;
  const s = role.scope;
  if (s.repos !== null && (ctx.repo_id == null || !s.repos.includes(ctx.repo_id))) return false;
  if (s.task_types !== null && (ctx.task_type == null || !s.task_types.includes(ctx.task_type))) return false;
  if (s.level_cap !== null && ctx.level != null && ctx.level > s.level_cap) return false;
  return true;
}
