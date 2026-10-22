import { BUILTIN_SKILLS, builtinSkillRef } from "@mandat/profile";
import type { BuiltinSkill } from "@mandat/profile";
import type { RepoSkill } from "@mandat/onboard";
import type { SqlClient } from "@mandat/ledger";

// E8e (v5 p. 4.5 (5), AC-5.7, D-354): the skills catalog of the org. The harness's skills are approved; the repo's are
// listed with their hash (they reach an agent only through an approved profile); a blocked one keeps its reason.
export async function upsertSkills(db: SqlClient, org: string, repoId: string, repo: readonly Omit<RepoSkill, "text">[]): Promise<void> {
  for (const name of Object.keys(BUILTIN_SKILLS) as BuiltinSkill[]) {
    const r = builtinSkillRef(name);
    await db.query(
      `insert into public.skills (org_id, name, description, source, content_hash, approved) values ($1::uuid, $2, $3, 'builtin', $4, true)
       on conflict (org_id, name) do update set description = excluded.description, content_hash = excluded.content_hash, approved = true, blocked_reason = null`,
      [org, r.name, r.description, r.content_hash],
    );
  }
  for (const k of repo) {
    if (k.name in BUILTIN_SKILLS) continue; // a repo skill never shadows a harness skill
    await db.query(
      `insert into public.skills (org_id, name, description, source, content_hash, approved, blocked_reason, repo_id) values ($1::uuid, $2, $3, 'repo', $4, false, $5, $6::uuid)
       on conflict (org_id, name) do update set description = excluded.description, content_hash = excluded.content_hash, blocked_reason = excluded.blocked_reason, repo_id = excluded.repo_id,
         approved = public.skills.approved and public.skills.content_hash = excluded.content_hash and excluded.blocked_reason is null`,
      [org, k.name, k.description.slice(0, 200), k.content_hash, k.blocked, repoId],
    );
  }
}
