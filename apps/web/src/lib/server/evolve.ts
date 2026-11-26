import { z } from "zod";
import { LearnCard, LearnSource, ProfileLayers, ProfileManifest, ProfileTrialStatus, profileHash } from "@mandat/contract";
import { applyChange } from "@mandat/profile";
import { factorAt } from "./actions";
import type { Result, SecondFactor } from "./actions";
import { hasCap } from "./roles";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";

// D-530: the trials of profile evolution per project, for the projects page; a row whose manifest does not read
// through the contract is left out (never shown half-understood).
// E9e (D-645): each proposal shows the rule that made it (`rule:<name>`) and whether only a person may accept it; a
// person decides it here (approve.rules; approving also needs a fresh TOTP); the regression cards are read alongside.
export interface TrialView {
  id: string;
  status: ProfileTrialStatus;
  manifest: ProfileManifest;
  bench: { before: { pass: number; total: number; false_verified: number }; after: { pass: number; total: number; false_verified: number } } | null;
  why: string | null;
  source: LearnSource | null;
  needs_person: boolean;
}

export async function profileTrials(db: Db, uid: string, org: string): Promise<Record<string, TrialView[]>> {
  const rows = await asUser(db, uid, async (sql) => (await sql.query<{ id: string; repo_id: string; status: string; manifest: unknown; bench: TrialView["bench"]; why: string | null; source: string | null; needs_person: boolean }>(
    "select id::text as id, repo_id::text as repo_id, status, manifest, bench, why, source, needs_person from public.profile_trials where org_id = $1::uuid order by created_at desc, change_key limit 100",
    [org],
  )).rows);
  const out: Record<string, TrialView[]> = {};
  for (const r of rows) {
    const m = ProfileManifest.safeParse(r.manifest);
    const s = ProfileTrialStatus.safeParse(r.status);
    if (!m.success || !s.success) continue;
    const src = LearnSource.safeParse(r.source);
    (out[r.repo_id] ??= []).push({ id: r.id, status: s.data, manifest: m.data, bench: r.bench, why: r.why, source: src.success ? src.data : null, needs_person: r.needs_person });
  }
  return out;
}

/** the org's open learning cards (model regressions), newest first */
export async function learnCards(db: Db, uid: string, org: string): Promise<LearnCard[]> {
  const rows = await asUser(db, uid, async (sql) => (await sql.query<{ card: unknown }>("select card from public.learn_cards where org_id = $1::uuid and status = 'open' order by created_at desc limit 50", [org])).rows);
  return rows.flatMap((r) => {
    const c = LearnCard.safeParse(r.card);
    return c.success ? [c.data] : [];
  });
}

export const TrialDecisionBody = z.object({ accept: z.boolean(), factor_id: z.string().max(100).optional(), code: z.string().regex(/^\d{6}$/).optional() }).strict();
const err = (status: number, error: string): Result => ({ status, body: { error } });
const pgCode = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined);

/** A person approves (a new version through private.decide_trial, with a fresh TOTP) or refuses a proposal. */
export async function decideTrial(db: Db, o: { uid: string; trialId: string; body: z.infer<typeof TrialDecisionBody>; secondFactor: SecondFactor }): Promise<Result> {
  const tr = (await asService(db, (sql) => sql.query<{ org_id: string; repo_id: string; status: string; manifest: unknown; layers: unknown }>(
    `select t.org_id::text as org_id, t.repo_id::text as repo_id, t.status, t.manifest, h.layers
       from public.profile_trials t join public.repos r on r.id = t.repo_id left join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved'
      where t.id = $1::uuid`,
    [o.trialId],
  ))).rows[0];
  if (!tr) return err(404, "unknown_proposal");
  if (!(await hasCap(db, o.uid, tr.org_id, "approve.rules", { repo: tr.repo_id }))) return err(403, "not_an_owner");
  if (tr.status !== "proposed" && tr.status !== "benched") return err(409, "not_open");
  let layers: ProfileLayers | null = null;
  let mfaAt: Date | null = null;
  if (o.body.accept) {
    const m = ProfileManifest.safeParse(tr.manifest);
    const cur = ProfileLayers.safeParse(tr.layers);
    if (!m.success || !cur.success) return err(409, "not_applicable");
    layers = ProfileLayers.parse(applyChange(cur.data, m.data.change));
    const f = await factorAt(o.secondFactor, { uid: o.uid, code: o.body.code, factorId: o.body.factor_id });
    if (!("at" in f)) return f;
    mfaAt = f.at;
  }
  try {
    const v = await asService(db, async (sql) => (await sql.query<{ v: number }>("select private.decide_trial($1::uuid, $2, $3::jsonb, $4, $5::uuid, $6::timestamptz) as v", [o.trialId, o.body.accept, layers ? JSON.stringify(layers) : null, layers ? profileHash(layers) : null, o.uid, mfaAt?.toISOString() ?? null])).rows[0]?.v);
    return { status: 200, body: { version: v } };
  } catch (e) {
    const c = pgCode(e);
    if (c === "42501") return err(403, "second_factor_rejected");
    if (c === "55000") return err(409, "not_open");
    if (c === "22023") return err(409, "not_applicable");
    throw e;
  }
}
