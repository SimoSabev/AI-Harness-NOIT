import type { SqlClient } from "@mandat/ledger";
import { appendLedgerOnline } from "@mandat/ledger";

// Демо промпт т. 5.1 (S28): `mandat demo seed --minimal` = demo org + owner (+ the shop repo), no UI data.
// Fixed ids so the seed is idempotent; the full seed (ladder, 4 accounts) is E3а.
export const DEMO_ORG_ID = "d0000000-0000-4000-8000-000000000001";
export const DEMO_OWNER_ID = "d0000000-0000-4000-8000-0000000000a1";
export const DEMO_REPO_ID = "d0000000-0000-4000-8000-0000000000b1";

export async function seedMinimal(db: SqlClient, o: { remoteUrl: string; ownerEmail?: string }): Promise<{ org: string; owner: string; repo: string; created: boolean }> {
  const exists = await db.query<{ n: number }>("select count(*)::int as n from public.orgs where id = $1", [DEMO_ORG_ID]);
  if ((exists.rows[0]?.n ?? 0) > 0) return { org: DEMO_ORG_ID, owner: DEMO_OWNER_ID, repo: DEMO_REPO_ID, created: false };
  await db.query("insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing", [DEMO_OWNER_ID, o.ownerEmail ?? "owner@demo.mandat.invalid"]);
  await db.query("insert into public.orgs (id, name, is_demo) values ($1, 'Mandat demo', true)", [DEMO_ORG_ID]);
  await db.query("insert into public.members (org_id, user_id, role) values ($1, $2, 'owner')", [DEMO_ORG_ID, DEMO_OWNER_ID]);
  await db.query("insert into public.repos (id, org_id, provider, full_name, remote_url, default_branch) values ($1, $2, 'local', 'mandat-demo/shop', $3, 'main')", [DEMO_REPO_ID, DEMO_ORG_ID, o.remoteUrl]);
  await appendLedgerOnline(db, { org_id: DEMO_ORG_ID, kind: "demo_reset", task_id: null, payload: { seed: "minimal", repo: "mandat-demo/shop" } });
  return { org: DEMO_ORG_ID, owner: DEMO_OWNER_ID, repo: DEMO_REPO_ID, created: true };
}
