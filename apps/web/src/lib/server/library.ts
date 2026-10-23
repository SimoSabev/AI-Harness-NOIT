import { splitDiff } from "../diff-view";
import type { DiffFile } from "../diff-view";
import { asUser } from "./sql";
import type { Db } from "./sql";

// The library: every file the agents wrote, per task (its latest changeset), newest first. The diffs stay where they
// are (changeset_diffs, approver+ by RLS); this only reads them, so nothing is stored twice.
export interface LibraryItem {
  task_id: string; text: string; agent: string; state: string; last_result: string | null; wait_reason: string | null;
  approval_needed: boolean; approved_by_human: boolean; updated_at: string; files: DiffFile[];
}

export async function library(db: Db, uid: string, org: string, limit = 100): Promise<LibraryItem[]> {
  return asUser(db, uid, async (sql) => {
    const rows = (await sql.query<Omit<LibraryItem, "files"> & { diff: string }>(
      `select t.id as task_id, t.text, t.agent, t.state, t.last_result, t.wait_reason, coalesce(c.approval_needed, false) as approval_needed,
              exists (select 1 from public.approvals a where a.changeset_id = c.id and a.decision = 'approved') as approved_by_human,
              to_char(t.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at, d.diff
         from public.tasks t
         join lateral (select * from public.changesets x where x.task_id = t.id order by x.attempt desc, x.created_at desc limit 1) c on true
         join public.changeset_diffs d on d.changeset_id = c.id
        where t.org_id = $1::uuid
        order by t.updated_at desc
        limit $2`,
      [org, limit],
    )).rows;
    return rows.map(({ diff, ...r }) => ({ ...r, files: splitDiff(diff) })).filter((r) => r.files.length > 0);
  });
}
