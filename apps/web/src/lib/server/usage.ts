import { newestWindows } from "@mandat/contract";
import type { LimitSnapshot } from "@mandat/contract";
import type { UsageRow } from "../usage";
import { asService } from "./sql";
import type { Db } from "./sql";

// D-629: every task and conversation of the org in the last `days` days, with what it spent — the facts of the usage page
export async function usageRows(db: Db, org: string, days: number): Promise<UsageRow[]> {
  const at = `to_char(x.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
  return (await asService(db, (sql) => sql.query<UsageRow>(
    `select x.agent, x.model, 'task' as kind, x.usd::float8 as usd, x.minutes::float8 as minutes, x.last_result as result, ${at} as at
       from public.tasks x where x.org_id = $1::uuid and x.created_at > now() - make_interval(days => $2)
     union all
     select x.agent, x.model, 'chat' as kind, x.usd::float8 as usd, 0::float8 as minutes, null as result, ${at} as at
       from public.conversations x where x.org_id = $1::uuid and x.created_at > now() - make_interval(days => $2)`,
    [org, days],
  ))).rows;
}

/** D-647: what is left of each subscription — the newest windows its CLI reported (a task or a conversation) in the last
 * 8 days, a week and a day; anything older says nothing about now. Each payload is checked (zod) at this border. */
export async function accountWindows(db: Db, org: string): Promise<Record<string, LimitSnapshot>> {
  const rows = (await asService(db, (sql) => sql.query<{ payload: unknown }>(
    `select g.payload from public.ledger g where g.org_id = $1::uuid and g.kind = 'limit_windows'
        and g.ts > to_char((now() - interval '8 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') order by g.seq desc limit 500`,
    [org],
  ))).rows;
  return newestWindows(rows.map((r) => r.payload));
}
