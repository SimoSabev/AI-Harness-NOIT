import { TwinClassKey, jcs, sha256Tag } from "@mandat/contract";
import { twinOffer, twinScore } from "@mandat/core";
import type { TwinScored } from "@mandat/core";
import { z } from "zod";
import { factorAt } from "./actions";
import type { Result, SecondFactor } from "./actions";
import { hasCap } from "./roles";
import type { TwinView } from "../twin-view";

export type { TwinView } from "../twin-view";
import { asService, asUser } from "./sql";

// D-523 (the owner's twin) in the web. twinView: what the twin would decide on this attempt and how often it
// was right in the class (members read it by RLS). decideTwinRule: the owner's ONE answer to the offer. Accepting
// widens what Mandat may do alone, so it needs approve.rules, a second factor, a ready class and an approved policy;
// declining (or turning an active rule off) only narrows, so any approver may do it at once.

export const TwinRuleBody = z.object({ class_key: z.string().max(300), accept: z.boolean(), code: z.string().regex(/^\d{6}$/).optional(), factor_id: z.string().max(100).optional() }).strict();
export type TwinRuleBody = z.infer<typeof TwinRuleBody>;

const err = (status: number, error: string): Result => ({ status, body: { error } });

export async function twinView(db: Parameters<typeof asUser>[0], uid: string, org: string, taskId: string): Promise<TwinView | null> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(taskId)) return null;
  return asUser(db, uid, async (sql) => {
    const p = (await sql.query<{ class_key: string; predicted: TwinView["predicted"]; p: number; n: number; by_twin: boolean }>(
      "select p.class_key, p.predicted, p.p, p.n, p.by_twin from public.twin_predictions p join public.tasks t on t.id = p.task_id and t.attempt = p.attempt where p.task_id = $1 and p.org_id = $2::uuid",
      [taskId, org],
    )).rows[0];
    if (!p) return null;
    const rows = (await sql.query<TwinScored>("select class_key, predicted, actual from public.twin_predictions where org_id = $1::uuid and class_key = $2 and not by_twin", [org, p.class_key])).rows;
    const score = twinScore(rows)[p.class_key];
    const rule = (await sql.query<{ revoked: boolean }>("select revoked_at is not null as revoked from public.twin_rules where org_id = $1::uuid and class_key = $2", [org, p.class_key])).rows[0];
    return {
      class_key: p.class_key, predicted: p.predicted, p: p.p, n: p.n, scored: score?.scored ?? 0, correct: score?.correct ?? 0,
      offer: twinOffer(score, rule !== undefined), rule: rule === undefined ? null : rule.revoked ? "off" : "active", by_twin: p.by_twin,
    };
  });
}

export async function decideTwinRule(db: Parameters<typeof asUser>[0], o: { uid: string; org: string; body: TwinRuleBody; secondFactor: SecondFactor }): Promise<Result> {
  if (!TwinClassKey.safeParse(o.body.class_key).success) return err(400, "bad_class");
  const repo = o.body.class_key.split("|")[0] ?? "";
  const r = (await asService(db, (sql) => sql.query<{ policy_hash: string | null }>(
    "select (select h.profile_hash from public.harness_profiles h where h.id = r.profile_id and h.status = 'approved') as policy_hash from public.repos r where r.id = $1::uuid and r.org_id = $2::uuid",
    [repo, o.org],
  ))).rows[0];
  if (!r) return err(404, "unknown_class");
  if (o.body.accept) {
    if (!(await hasCap(db, o.uid, o.org, "approve.rules", { repo }))) return err(403, "not_an_owner");
    if (!r.policy_hash) return err(409, "no_policy");
    const rows = (await asService(db, (sql) => sql.query<TwinScored>("select class_key, predicted, actual from public.twin_predictions where org_id = $1::uuid and class_key = $2 and not by_twin", [o.org, o.body.class_key]))).rows;
    if (!twinOffer(twinScore(rows)[o.body.class_key], false)) return err(409, "not_ready");
    const f = await factorAt(o.secondFactor, { uid: o.uid, code: o.body.code, factorId: o.body.factor_id });
    if (!("at" in f)) return f;
  } else if (!(await hasCap(db, o.uid, o.org, "approve.level1", { repo }))) return err(403, "not_an_approver");
  await asService(db, async (sql) => {
    await sql.query(
      `insert into public.twin_rules (org_id, class_key, approved_by, policy_hash, revoked_at) values ($1::uuid, $2, $3::uuid, $4, case when $5 then null else now() end)
       on conflict (org_id, class_key) do update set approved_by = excluded.approved_by, approved_at = now(), policy_hash = excluded.policy_hash, revoked_at = excluded.revoked_at`,
      [o.org, o.body.class_key, o.uid, r.policy_hash ?? `sha256:${"0".repeat(64)}`, o.body.accept],
    );
    const payload = jcs({ class_key: o.body.class_key, accepted: o.body.accept, policy_hash: r.policy_hash, by: o.uid });
    await sql.query("select private.ledger_append($1::uuid, 'twin_rule', null, $2, $3)", [o.org, payload, sha256Tag(payload)]);
  });
  return { status: 200, body: { rule: o.body.accept ? "active" : "off" } };
}
