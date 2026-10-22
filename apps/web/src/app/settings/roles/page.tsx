import type { Metadata } from "next";
import { Capability, DANGEROUS } from "@mandat/contract";
import { Shell } from "../../../components/shell";
import { RolesManager } from "../../../components/roles-manager";
import { card } from "../../../components/ui";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { db } from "../../../lib/server/db";
import { pageCtx } from "../../../lib/server/page";
import { listRoles } from "../../../lib/server/roles";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("roles.title")) };
}

interface RoleRow { id: string; name: string; builtin: boolean; capabilities: string[]; scope: { repos: string[] | null; task_types: string[] | null; level_cap: number | null } }
interface MemberRow { user_id: string; email: string | null; role_id: string }

// E8c (v5 p. 4.3): roles are data — the builtin ones (read-only), the org's own, and the role of each member.
export default async function RolesPage() {
  const c = await pageCtx();
  const t = await getT();
  const r = await listRoles(db(), { uid: c.uid, org: c.org });
  const roles = (r.body.roles ?? []) as RoleRow[];
  const members = (r.body.members ?? []) as MemberRow[];
  const scopeText = (s: RoleRow["scope"]) => {
    const parts: string[] = [];
    if (s.repos) parts.push(t("roles.scopeRepos", { n: s.repos.length }));
    if (s.task_types) parts.push(t("roles.scopeTypes", { types: s.task_types.join(", ") }));
    if (s.level_cap !== null && s.level_cap !== undefined) parts.push(t("roles.scopeLevel", { n: s.level_cap }));
    return parts.length ? parts.join(" · ") : t("roles.scopeAll");
  };
  return (
    <Shell current="settings" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("roles.title")}</h1>
      <p className="mt-1 text-sm text-mute">{t("roles.intro")}</p>
      {r.status !== 200 ? (
        <p role="note" className={`${card} mt-6 p-5 text-sm`}>{t("roles.noAccess")}</p>
      ) : (
        <>
          <ul className="mt-6 grid gap-3 lg:grid-cols-2" aria-label={t("roles.title")}>
            {roles.map((role) => (
              <li key={role.id} className={`${card} p-4`}>
                <p className="flex items-center gap-2 font-medium">
                  {role.name}
                  {role.builtin && <span className="rounded bg-raised px-1.5 py-0.5 text-[11px] text-mute">{t("roles.builtin")}</span>}
                </p>
                <p className="mt-1 text-xs text-mute">{t("roles.scope")}: {scopeText(role.scope)}</p>
                <ul className="mt-2 flex flex-wrap gap-1">
                  {role.capabilities.map((cap) => (
                    <li key={cap} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${DANGEROUS.has(cap as Capability) ? "bg-warn-soft text-warn" : "bg-raised text-ink"}`}>
                      {cap}
                      {DANGEROUS.has(cap as Capability) && <span className="sr-only"> ({t("roles.dangerous")})</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <RolesManager capabilities={[...Capability.options]} dangerous={[...DANGEROUS]} roles={roles.map((x) => ({ id: x.id, name: x.name }))} members={members} />
        </>
      )}
    </Shell>
  );
}
