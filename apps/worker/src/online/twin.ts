import { TwinClassKey } from "@mandat/contract";
import type { TwinChoice } from "@mandat/contract";
import { twinMayDecide, twinModel, twinOffer, twinPredict, twinScore } from "@mandat/core";
import type { TwinDecision, TwinScored } from "@mandat/core";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";

// D-523 „Двойникът на собственика“ (round 1, feature 2): the tick beside the night and the self-finish ticks.
// 1. settle: a prediction gets the owner's real decision (never the twin's own approval: it would teach itself);
// 2. predict: one shadow prediction per attempt waiting on an approval, from the owner's weighted history of that class;
// 3. offer: the classes accurate enough and without a rule (the web asks the owner ONCE);
// 4. act: under an approved rule, the twin approves through private.approve_changeset as the rule's owner, with
//    method 'twin' (refused by the database wherever a second factor is required), inside the weekly budget.
export interface TwinTick { predicted: string[]; decided: string[]; offers: string[] }

/** the class of an approval wait: a second factor is its own reason, so the twin never mixes it with a plain one */
const CLASS = `t.repo_id::text || '|' || t.type || '|' || t.agent || '|' || case when c.requires_second_factor then 'approval_2fa' else 'approval' end`;

const SETTLE = `
  update public.twin_predictions p set actual = a.decision, decided_at = a.decided_at
    from public.changesets c join public.approvals a on a.changeset_id = c.id and a.method <> 'twin'
   where p.actual is null and not p.by_twin and c.task_id = p.task_id and c.attempt = p.attempt`;

const HISTORY = `
  select ${CLASS} as class_key, a.decision, to_char(a.decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at
    from public.approvals a join public.changesets c on c.id = a.changeset_id join public.tasks t on t.id = c.task_id
   where a.method <> 'twin' and a.decided_at > now() - interval '365 days'`;

const WAITING = `
  select t.id, t.org_id::text as org_id, t.attempt, t.state, t.wait_reason, t.last_result, ${CLASS} as class_key,
         c.id::text as changeset_id, c.head_sha, c.requires_second_factor, c.effective_level,
         (select h.profile_hash from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = t.repo_id) as policy_hash,
         exists (select 1 from public.twin_predictions p where p.task_id = t.id and p.attempt = t.attempt) as has_prediction
    from public.tasks t join public.changesets c on c.task_id = t.id and c.attempt = t.attempt and c.approval_needed
   where t.state = 'HELD' and t.wait_reason in ('approval', 'approval_2fa', 'second_factor') and t.shift_id is null
   order by t.state_entered_at
   limit 200`;

interface Waiting {
  id: string; org_id: string; attempt: number; state: string; wait_reason: string | null; last_result: string | null; class_key: string;
  changeset_id: string; head_sha: string | null; requires_second_factor: boolean; effective_level: number | null; policy_hash: string | null; has_prediction: boolean;
}
interface Rule { id: string; org_id: string; class_key: string; approved_by: string; weekly_budget: number; policy_hash: string; revoked_at: string | null }

export async function twinTick(db: SqlClient, o: { now: Date }): Promise<TwinTick> {
  const out: TwinTick = { predicted: [], decided: [], offers: [] };
  const now = o.now.toISOString();
  await db.query(SETTLE);
  const history = (await db.query<TwinDecision>(HISTORY)).rows;
  const model = twinModel(history, now);
  const scores = twinScore((await db.query<TwinScored>("select class_key, predicted, actual from public.twin_predictions where not by_twin")).rows);
  const rules = new Map((await db.query<Rule>("select id::text as id, org_id::text as org_id, class_key, approved_by::text as approved_by, weekly_budget, policy_hash, revoked_at::text as revoked_at from public.twin_rules")).rows.map((r) => [`${r.org_id}/${r.class_key}`, r]));
  for (const t of (await db.query<Waiting>(WAITING)).rows) {
    if (!TwinClassKey.safeParse(t.class_key).success) continue; // e.g. an agent id outside the key's alphabet: the owner decides
    const guess = twinPredict(model, t.class_key);
    if (!t.has_prediction) {
      await db.query("insert into public.twin_predictions (org_id, task_id, attempt, class_key, predicted, p, n) values ($1::uuid, $2, $3, $4, $5, $6, $7) on conflict (task_id, attempt) do nothing", [t.org_id, t.id, t.attempt, t.class_key, guess.predicted, guess.p, guess.n]);
      out.predicted.push(t.id);
    }
    const rule = rules.get(`${t.org_id}/${t.class_key}`) ?? null;
    const used = rule ? await usedThisWeek(db, t.org_id, t.class_key) : 0;
    const act = twinMayDecide({
      rule: rule ? { weekly_budget: rule.weekly_budget, policy_hash: rule.policy_hash, revoked_at: rule.revoked_at } : null,
      policy_hash_now: t.policy_hash, used_this_week: used, prediction: guess, score: scores[t.class_key],
      task: { state: t.state, wait_reason: t.wait_reason, last_result: t.last_result, requires_second_factor: t.requires_second_factor, effective_level: t.effective_level },
    });
    if (act.act && rule && t.head_sha && (await approveAsTwin(db, t, rule, { p: guess.p, n: guess.n, lower: scores[t.class_key]?.lower ?? 0 }))) out.decided.push(t.id);
  }
  const ruled = new Set([...rules.values()].map((r) => r.class_key));
  out.offers = Object.entries(scores).filter(([k, s]) => twinOffer(s, ruled.has(k))).map(([k]) => k);
  return out;
}

async function usedThisWeek(db: SqlClient, org: string, classKey: string): Promise<number> {
  const r = await db.query<{ n: number }>("select count(*)::int as n from public.twin_predictions where org_id = $1::uuid and class_key = $2 and by_twin and decided_at > now() - interval '7 days'", [org, classKey]);
  return r.rows[0]?.n ?? 0;
}

/** One transaction: the approval (CAS on head_sha, the owner's capability, the method trigger), the card leaves "waiting". */
async function approveAsTwin(db: SqlClient, t: Waiting, rule: Rule, why: { p: number; n: number; lower: number }): Promise<boolean> {
  const decision: TwinChoice = "approved";
  try {
    await db.query("begin");
    const moved = await db.query("update public.tasks set state = 'GATED', wait_reason = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1 and state = 'HELD' and attempt = $2 returning id", [t.id, t.attempt]);
    if (moved.rows.length === 0) {
      await db.query("rollback");
      return false;
    }
    await db.query("select private.approve_changeset($1::uuid, $2, $3::uuid, $4, $5, 'twin', 'twin', null)", [t.changeset_id, t.head_sha, rule.approved_by, decision, `twin: ${t.class_key}`]);
    await db.query("update public.changesets set approval_needed = false where id = $1::uuid", [t.changeset_id]);
    await db.query("update public.twin_predictions set by_twin = true, decided_at = now() where task_id = $1 and attempt = $2", [t.id, t.attempt]);
    await appendLedgerOnline(db, { org_id: t.org_id, kind: "twin_decided", task_id: t.id, payload: { attempt: t.attempt, class_key: t.class_key, rule_id: rule.id, decision, head_sha: t.head_sha, policy_hash: rule.policy_hash, p: Math.round(why.p * 1000) / 1000, n: why.n, lower: Math.round(why.lower * 1000) / 1000, by: "twin" } });
    await db.query("commit");
    return true;
  } catch {
    await db.query("rollback");
    return false; // the database said no (head moved, no capability, a second factor): the owner decides
  }
}
