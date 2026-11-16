import { ProfileManifest, ProfileTrialStatus } from "@mandat/contract";
import { asUser } from "./sql";
import type { Db } from "./sql";

// D-530: the trials of profile evolution per project, for the projects page; a row whose manifest does not read
// through the contract is left out (never shown half-understood).
export interface TrialView {
  status: ProfileTrialStatus;
  manifest: ProfileManifest;
  bench: { before: { pass: number; total: number; false_verified: number }; after: { pass: number; total: number; false_verified: number } } | null;
  why: string | null;
}

export async function profileTrials(db: Db, uid: string, org: string): Promise<Record<string, TrialView[]>> {
  const rows = await asUser(db, uid, async (sql) => (await sql.query<{ repo_id: string; status: string; manifest: unknown; bench: TrialView["bench"]; why: string | null }>(
    "select repo_id::text as repo_id, status, manifest, bench, why from public.profile_trials where org_id = $1::uuid order by created_at desc limit 100",
    [org],
  )).rows);
  const out: Record<string, TrialView[]> = {};
  for (const r of rows) {
    const m = ProfileManifest.safeParse(r.manifest);
    const s = ProfileTrialStatus.safeParse(r.status);
    if (!m.success || !s.success) continue;
    (out[r.repo_id] ??= []).push({ status: s.data, manifest: m.data, bench: r.bench, why: r.why });
  }
  return out;
}
