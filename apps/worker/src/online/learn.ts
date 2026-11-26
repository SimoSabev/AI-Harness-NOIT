import { LEARN_LIMITS } from "@mandat/contract";
import type { TaskType } from "@mandat/contract";
import { channelQuality, costForecast, forecastAccuracy, modelRegression, profileAB } from "@mandat/learn";
import type { AbTable, AskRow, CostKey, Forecast, LearnFailureRow, Quality, VersionRow } from "@mandat/learn";
import type { SqlClient } from "@mandat/ledger";

// E9д (spec 5.5, PRD 6.11, D-644): the worker reads what learning needs from the database; the statistics and the rules
// themselves are pure (packages/learn). Nothing here changes the profile: proposals go to profile_trials (evolve.ts),
// cards to learn_cards, Q and the forecast into the channel choice of the daemon.

const ISO = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const DONE = "('BLOCKED', 'CLOSED', 'HELD', 'GATED', 'DELIVERED', 'OUTCOME')";

/** the failures (with the person's label of the latest verdict) and the asks of a repo since `since` */
export async function learnInputs(db: SqlClient, repoId: string, since: string): Promise<{ failures: LearnFailureRow[]; asks: AskRow[] }> {
  const f = await db.query<{ task_id: string; task_type: TaskType; at: string; reasons: unknown; label: { layer: string; label: string } | null }>(
    `select t.id as task_id, t.type as task_type, ${ISO("t.state_entered_at")} as at, coalesce(v.reasons, '[]'::jsonb) as reasons,
            (select jsonb_build_object('layer', fl.layer, 'label', fl.label) from public.failure_labels fl where fl.verdict_id = v.id order by fl.id desc limit 1) as label
       from public.tasks t
       join lateral (select v.id, v.reasons from public.verdicts v where v.task_id = t.id order by v.created_at desc limit 1) v on true
      where t.repo_id = $1::uuid and t.state in ${DONE} and t.state_entered_at > $2::timestamptz`,
    [repoId, since],
  );
  const a = await db.query<AskRow>(
    `select a.task_id, t.type as task_type, a.tool, a.status, ${ISO("coalesce(a.decided_at, a.created_at)")} as at
       from public.tool_asks a join public.tasks t on t.id = a.task_id
      where t.repo_id = $1::uuid and coalesce(a.decided_at, a.created_at) > $2::timestamptz order by a.created_at limit 5000`,
    [repoId, since],
  );
  return {
    failures: f.rows.map((r) => ({ ...r, reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === "string") : [] })),
    asks: a.rows,
  };
}

/** Q by "<channel>|<task type>" from the org's decided outcomes (good = VERIFIED and a success outcome) */
export async function channelQualityOf(db: SqlClient, orgId: string, now: Date): Promise<Map<string, Quality>> {
  const r = await db.query<{ channel_id: string; task_type: string; at: string; good: boolean }>(
    `select t.channel_id::text as channel_id, t.type as task_type, ${ISO("o.decided_at")} as at, (o.result = 'success' and t.last_result = 'VERIFIED') as good
       from public.outcomes o join public.changesets c on c.id = o.changeset_id join public.tasks t on t.id = c.task_id
      where t.org_id = $1::uuid and t.channel_id is not null and o.result <> 'neutral' and o.decided_at > $2::timestamptz
      order by o.decided_at desc limit 5000`,
    [orgId, new Date(now.getTime() - 365 * 86_400_000).toISOString()],
  );
  return channelQuality(r.rows, now);
}

/** the forecast for a new task of (repo, type, agent): the last 10 paid tasks of the same kind */
export async function forecastFor(db: SqlClient, key: CostKey): Promise<Forecast | null> {
  const r = await db.query<{ usd: number; at: string }>(
    `select t.usd::float8 as usd, ${ISO("t.state_entered_at")} as at from public.tasks t
      where t.repo_id = $1::uuid and t.type = $2 and t.agent = $3 and t.usd > 0 and t.state in ${DONE}
      order by t.state_entered_at desc limit ${LEARN_LIMITS.cost_last_n}`,
    [key.repo_id, key.task_type, key.agent],
  );
  return costForecast(r.rows.map((x) => ({ ...key, ...x })), key);
}

/**
 * AC-11.3 (D-646): the forecast measured walking forward over every finished task of the database, by USD or, where the
 * tasks ran on a subscription (usd = 0), by minutes as a stand-in for the cost.
 */
export async function forecastAccuracyOf(db: SqlClient, o: { by: "usd" | "minutes"; minPrior?: number }): Promise<{ tasks: number; within: number; share: number | null }> {
  const col = o.by === "usd" ? "t.usd" : "t.minutes";
  const r = await db.query<{ repo_id: string; task_type: string; agent: string; usd: number; at: string }>(
    `select t.repo_id::text as repo_id, t.type as task_type, t.agent, ${col}::float8 as usd, ${ISO("t.state_entered_at")} as at
       from public.tasks t where ${col} > 0 and t.state in ${DONE} order by t.state_entered_at limit 20000`,
  );
  return forecastAccuracy(r.rows, o.minPrior === undefined ? {} : { minPrior: o.minPrior });
}

/** the repo's current approved version against its parent; each task counts under the version approved when it was created */
export async function abTable(db: SqlClient, repoId: string): Promise<AbTable | null> {
  const cur = (await db.query<{ version: number; parent: number | null }>(
    `select h.version, coalesce((select p.version from public.harness_profiles p where p.id = h.parent_id),
            (select max(p.version) from public.harness_profiles p where p.repo_id = h.repo_id and p.version < h.version and p.approved_at is not null)) as parent
       from public.repos r join public.harness_profiles h on h.id = r.profile_id where r.id = $1::uuid`,
    [repoId],
  )).rows[0];
  if (!cur || cur.parent === null) return null;
  const rows = await db.query<VersionRow>(
    `select x.version, t.type as task_type, v.result, t.attempt as attempts, t.usd::float8 as usd
       from public.tasks t
       join lateral (select v.result from public.verdicts v where v.task_id = t.id order by v.created_at desc limit 1) v on true
       join lateral (select h.version from public.harness_profiles h where h.repo_id = t.repo_id and h.approved_at is not null and h.approved_at <= t.created_at order by h.approved_at desc limit 1) x on true
      where t.repo_id = $1::uuid and x.version in ($2, $3) limit 5000`,
    [repoId, cur.parent, cur.version],
  );
  return profileAB(rows.rows, cur.parent, cur.version);
}

/** D-644: model regression cards per org (the last two full weeks); one card per model and week, never twice */
export async function learnCardsTick(db: SqlClient, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - 21 * 86_400_000).toISOString();
  const rows = await db.query<{ org_id: string; model: string; at: string; verified: boolean }>(
    `select t.org_id::text as org_id, t.agent || ':' || coalesce(t.model, 'default') as model, ${ISO("v.created_at")} as at, v.result = 'VERIFIED' as verified
       from public.tasks t join lateral (select v.result, v.created_at from public.verdicts v where v.task_id = t.id order by v.created_at desc limit 1) v on true
      where t.kind = 'work' and v.created_at > $1::timestamptz limit 20000`,
    [since],
  );
  const byOrg = new Map<string, { model: string; at: string; verified: boolean }[]>();
  for (const r of rows.rows) byOrg.set(r.org_id, [...(byOrg.get(r.org_id) ?? []), r]);
  const out: string[] = [];
  for (const [org, xs] of byOrg) {
    for (const card of modelRegression(xs, now)) {
      const key = `model_regression|${card.model}|${card.week}`.slice(0, 300);
      const ins = await db.query("insert into public.learn_cards (org_id, card_key, card) values ($1::uuid, $2, $3::jsonb) on conflict (org_id, card_key) do nothing returning id", [org, key, JSON.stringify(card)]);
      if (ins.rows.length > 0) out.push(key);
    }
  }
  return out;
}
