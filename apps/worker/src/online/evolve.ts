import { EVOLVE_LIMITS, ProfileLayers, ProfileManifest, profileHash } from "@mandat/contract";
import type { ProfileLayers as Layers, TaskType } from "@mandat/contract";
import { ablationCandidates, applyChange, hasChange, lineage, predictionHeld, removeChange } from "@mandat/profile";
import { gateDecision, rulesFromFailures, undoChange, watchDecision, weakens } from "@mandat/learn";
import type { WatchRow } from "@mandat/learn";
import type { FailureRow, LineageStep, LineageTrial, LineageVersion } from "@mandat/profile";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import { learnCardsTick, learnInputs } from "./learn.js";
import { enqueueOutbox } from "./pg-outbox.js";

// D-530 (round 2): profile evolution with evidence, the worker's tick.
// 1. propose: a recurring failure class of a project → a trial (one per change, never twice);
// 2. gate: the bench runs the same scenarios with the current and the changed profile; worse → refused; not worse and
//    narrowing → Mandat accepts it as a new approved version (the twin's rule follows the narrowing, by Simo's choice);
//    D-650 (Simo 26.11.2026): nothing waits for a person. A change that can weaken the verdict (a flaky test, an allowed
//    tool) applies only with the held-out set and no false VERIFIED (packages/learn gateDecision);
// 3. watch: an accepted change whose prediction the next tasks falsify is rolled back to the old layers; a weakening one
//    rolls back when its task type's failures or a model regression get worse (watchDecision).
// Every apply and roll back is a profile_change row (by: mandat) and a push.
export interface Score { pass: number; total: number; false_verified: number }
/** D-550: the visible scenarios plus, when run, the held-out heavy set (only its counts ever leave the gate) */
export interface BenchScore extends Score { heldout?: Score }
export type BenchRunner = (layers: Layers, taskType: TaskType) => Promise<BenchScore>;
export interface EvolveTick { proposed: string[]; accepted: string[]; refused: string[]; rolledBack: string[]; /** D-553: removal trials benched this tick */ ablated: string[]; /** D-644: model regression cards written this tick */ cards?: string[] }

interface Repo { id: string; org_id: string; profile_id: string; version: number; layers: unknown }
interface Trial { id: string; org_id: string; repo_id: string; change_key: string; manifest: unknown; from_profile: string; to_profile: string | null; decided_at: string | null; source?: string | null }
const TRIAL = "id::text as id, org_id::text as org_id, repo_id::text as repo_id, change_key, manifest, from_profile::text as from_profile, to_profile::text as to_profile, decided_at::text as decided_at, source";

const REPOS = `select r.id::text as id, r.org_id::text as org_id, h.id::text as profile_id, h.version, h.layers
  from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved'`;
/** per task of the repo: its type, when it ended, the reasons of its latest verdict */
const ROWS = `select t.id as task_id, t.type as task_type, to_char(t.state_entered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at,
         coalesce((select v.reasons from public.verdicts v where v.task_id = t.id order by v.created_at desc limit 1), '[]'::jsonb) as reasons
    from public.tasks t
   where t.repo_id = $1::uuid and t.state in ('BLOCKED', 'CLOSED', 'HELD', 'GATED', 'DELIVERED', 'OUTCOME') and t.state_entered_at > $2::timestamptz
     and exists (select 1 from public.verdicts v where v.task_id = t.id)`;

const keyOf = (m: ProfileManifest) => `${m.change.rule}|${m.change.detail}|${m.prediction.task_type}`;
const rowsOf = (rows: { task_id: string; task_type: TaskType; at: string; reasons: unknown }[]): FailureRow[] =>
  rows.map((r) => ({ ...r, reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === "string") : [] }));

const worse = (a: Score, b: Score) => a.pass < b.pass || a.false_verified > b.false_verified;
const DONE = "('BLOCKED', 'CLOSED', 'HELD', 'GATED', 'DELIVERED', 'OUTCOME')";

export async function evolveTick(db: SqlClient, o: { now: Date; bench?: BenchRunner; /** D-550: no held-out counts → nothing is accepted by itself */ requireHeldout?: boolean }): Promise<EvolveTick> {
  const out: EvolveTick = { proposed: [], accepted: [], refused: [], rolledBack: [], ablated: [] };
  for (const r of (await db.query<Repo>(REPOS)).rows) {
    const layers = ProfileLayers.safeParse(r.layers);
    if (!layers.success) continue;
    await propose(db, r, layers.data, o.now, out);
    if (o.bench) await gate(db, r, layers.data, o.bench, out, o.requireHeldout ?? false);
    await watch(db, r, out);
    if (out.rolledBack.length === 0) await watchWeakening(db, r, o.now, out);
    if (o.bench && out.accepted.length === 0 && out.rolledBack.length === 0) await ablate(db, r, o.bench, out);
  }
  out.cards = await learnCardsTick(db, o.now);
  return out;
}

async function propose(db: SqlClient, r: Repo, layers: Layers, now: Date, out: EvolveTick): Promise<void> {
  const since = new Date(now.getTime() - EVOLVE_LIMITS.window_days * 86_400_000).toISOString();
  // E9д (D-641): the D-530/D-549 classes with their rule's name, plus flaky tests and repeated asks; D-650: none waits
  // for a person (needs_person stays false; the column keeps the trials made before)
  for (const { manifest: m, weakens: weak } of rulesFromFailures(await learnInputs(db, r.id, since), layers, now.toISOString())) {
    const ins = await db.query("insert into public.profile_trials (org_id, repo_id, change_key, manifest, from_profile, source) values ($1::uuid, $2::uuid, $3, $4::jsonb, $5::uuid, $6) on conflict (repo_id, change_key) do nothing returning id", [r.org_id, r.id, keyOf(m).slice(0, 300), JSON.stringify(m), r.profile_id, m.source ?? null]);
    if (ins.rows.length === 0) continue;
    await appendLedgerOnline(db, { org_id: r.org_id, kind: "profile_trial", task_id: null, payload: { status: "proposed", change: m.change, reason_class: m.reason_class, evidence: m.evidence.length, prediction: m.prediction, ...(m.source ? { source: m.source } : {}), weakens: weak, by: "mandat" } });
    out.proposed.push(keyOf(m));
  }
}

async function gate(db: SqlClient, r: Repo, layers: Layers, bench: BenchRunner, out: EvolveTick, requireHeldout: boolean): Promise<void> {
  // D-650: every open proposal, the learned ones included (the trials made before with needs_person, too)
  const open = (await db.query<Trial>(`select ${TRIAL} from public.profile_trials where repo_id = $1::uuid and status = 'proposed' order by created_at, change_key`, [r.id])).rows;
  for (const t of open) {
    const m = ProfileManifest.safeParse(t.manifest);
    if (!m.success) continue;
    const candidate = applyChange(layers, m.data.change);
    const type = m.data.prediction.task_type;
    const [before, after] = [await bench(layers, type), await bench(candidate, type)];
    const scores = { before, after };
    const d = gateDecision({ layers, candidate, change: m.data.change, before, after, requireHeldout });
    if (!d.apply) {
      await decide(db, t, "refused", scores, d.why);
      out.refused.push(t.change_key);
      continue;
    }
    const to = await newVersion(db, r, candidate, { action: d.watch === "regression" ? "learn" : "evolve", trial: t, source: m.data.source ?? null });
    await db.query("update public.profile_trials set to_profile = $2::uuid where id = $1::uuid", [t.id, to]);
    await decide(db, t, "accepted", scores, `${m.data.reason_class} ×${m.data.evidence.length}; ${d.why}`);
    await notify(db, t, "accepted");
    out.accepted.push(t.change_key);
    return; // one change per tick: the next trial is benched against the new profile
  }
}

async function watch(db: SqlClient, r: Repo, out: EvolveTick): Promise<void> {
  const live = (await db.query<Trial>(`select ${TRIAL} from public.profile_trials where repo_id = $1::uuid and status = 'accepted' and to_profile = $2::uuid`, [r.id, r.profile_id])).rows;
  for (const t of live) {
    const m = ProfileManifest.safeParse(t.manifest);
    // a weakening change is watched for regressions instead (watchWeakening)
    if (!m.success || !t.decided_at || weakens(m.data.change)) continue;
    const later = rowsOf((await db.query<{ task_id: string; task_type: TaskType; at: string; reasons: unknown }>(ROWS, [r.id, t.decided_at])).rows);
    const p = predictionHeld(m.data, later);
    if (p.held) continue;
    const old = (await db.query<{ layers: unknown }>("select layers from public.harness_profiles where id = $1::uuid", [t.from_profile])).rows[0];
    const back = ProfileLayers.safeParse(old?.layers);
    if (!back.success) continue;
    await newVersion(db, r, back.data, { action: "evolve_rollback", trial: t, source: m.data.source ?? null });
    await decide(db, t, "rolled_back", null, `the prediction failed: ${m.data.reason_class} came back ${p.repeats}× in ${p.seen} task(s)`);
    await notify(db, t, "rolled_back");
    out.rolledBack.push(t.change_key);
    return;
  }
}

/** one finished task of the type: bad = its latest verdict is not VERIFIED, or its merged change failed afterwards */
const WATCH_ROW = `select to_char(t.state_entered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at,
         (v.result <> 'VERIFIED' or exists (select 1 from public.changesets c join public.outcomes o on o.changeset_id = c.id where c.task_id = t.id and o.result = 'failure')) as bad
    from public.tasks t join lateral (select v.result from public.verdicts v where v.task_id = t.id order by v.created_at desc limit 1) v on true
   where t.repo_id = $1::uuid and t.type = $2 and t.state in ${DONE}`;

/**
 * D-650: a change that can weaken the verdict (a flaky test, an allowed tool), still in the profile, is watched over the
 * next tasks of its type: worse failures than before it, or a model regression card (D-642) of a model this repo runs for
 * a week the watch overlaps → back to what it replaced, keeping what came after. One roll back per tick.
 */
async function watchWeakening(db: SqlClient, r: Repo, now: Date, out: EvolveTick): Promise<void> {
  const cur = ProfileLayers.safeParse((await db.query<{ layers: unknown }>("select layers from public.harness_profiles where id = $1::uuid", [r.profile_id])).rows[0]?.layers);
  if (!cur.success) return;
  const live = (await db.query<Trial & { applied: string }>(`select ${TRIAL}, to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as applied from public.profile_trials where repo_id = $1::uuid and status = 'accepted' and decided_at > $2::timestamptz order by decided_at`, [r.id, new Date(now.getTime() - 90 * 86_400_000).toISOString()])).rows;
  for (const t of live) {
    const m = ProfileManifest.safeParse(t.manifest);
    if (!m.success || !weakens(m.data.change) || !hasChange(cur.data, m.data.change)) continue;
    const type = m.data.prediction.task_type;
    const after = (await db.query<WatchRow>(`${WATCH_ROW} and t.state_entered_at > $3::timestamptz order by t.state_entered_at limit 50`, [r.id, type, t.applied])).rows;
    const before = (await db.query<WatchRow>(`${WATCH_ROW} and t.state_entered_at <= $3::timestamptz order by t.state_entered_at desc limit 50`, [r.id, type, t.applied])).rows;
    const regressions = (await db.query<{ week: string }>(
      `select distinct c.card ->> 'week' as week from public.learn_cards c
        where c.org_id = $1::uuid and c.card ->> 'kind' = 'model_regression'
          and c.card ->> 'model' in (select t.agent || ':' || coalesce(t.model, 'default') from public.tasks t where t.repo_id = $2::uuid and t.created_at > $3::timestamptz - interval '30 days')`,
      [r.org_id, r.id, t.applied],
    )).rows;
    const d = watchDecision({ applied_at: t.applied, now: now.toISOString(), before, after, regressions });
    if (d.action !== "rollback") continue;
    const from = ProfileLayers.safeParse((await db.query<{ layers: unknown }>("select layers from public.harness_profiles where id = $1::uuid", [t.from_profile])).rows[0]?.layers);
    if (!from.success) continue;
    await newVersion(db, r, ProfileLayers.parse(undoChange(cur.data, from.data, m.data.change)), { action: "evolve_rollback", trial: t, source: m.data.source ?? null });
    await decide(db, t, "rolled_back", null, d.why);
    await notify(db, t, "rolled_back");
    out.rolledBack.push(t.change_key);
    return;
  }
}

/** D-650: a push to the org when Mandat applied or rolled back a learned change by itself */
async function notify(db: SqlClient, t: Trial, status: "accepted" | "rolled_back"): Promise<void> {
  await enqueueOutbox(db, { org_id: t.org_id, kind: "web_push", idempotency_key: `push:learn:${t.id}:${status}`, payload: { kind: "profile_learn", trial_id: t.id, status } });
}

/** A new approved version of the repo's profile in one transaction; the old one superseded; twin rules follow its hash. */
async function newVersion(db: SqlClient, r: Repo, layers: Layers, why: { action: string; trial: Trial; source: string | null }): Promise<string> {
  const hash = profileHash(layers);
  await db.query("begin");
  try {
    const old = (await db.query<{ profile_hash: string }>("select profile_hash from public.harness_profiles where id = $1::uuid", [r.profile_id])).rows[0];
    const v = (await db.query<{ v: number }>("select coalesce(max(version), 0) + 1 as v from public.harness_profiles where repo_id = $1::uuid", [r.id])).rows[0]?.v ?? r.version + 1;
    // D-551: the new version names its parent, how it came and the trial behind it (the archive keeps the old one)
    const ins = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at, parent_id, origin, trial_id) values ($1::uuid, $2::uuid, $3, $4::jsonb, '{}', $5, 'approved', now(), $6::uuid, $7, $8::uuid) returning id::text as id", [r.org_id, r.id, v, JSON.stringify(layers), hash, r.profile_id, why.action, why.trial.id]);
    const id = ins.rows[0]?.id as string;
    await db.query("update public.harness_profiles set status = 'superseded' where id = $1::uuid and status = 'approved'", [r.profile_id]);
    await db.query("update public.repos set profile_id = $2::uuid where id = $1::uuid", [r.id, id]);
    if (old) await db.query("update public.twin_rules set policy_hash = $3 where org_id = $1::uuid and policy_hash = $2 and revoked_at is null", [r.org_id, old.profile_hash, hash]);
    await appendLedgerOnline(db, { org_id: r.org_id, kind: "profile_change", task_id: null, payload: { action: why.action, trial_id: why.trial.id, change_key: why.trial.change_key, ...(why.source ? { source: why.source } : {}), profile_id: id, profile_hash: hash, version: v, by: "mandat" } });
    await db.query("commit");
    r.profile_id = id;
    r.version = v;
    return id;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function decide(db: SqlClient, t: Trial, status: "benched" | "accepted" | "refused" | "rolled_back", bench: { before: BenchScore; after: BenchScore } | null, why: string): Promise<void> {
  await db.query("update public.profile_trials set status = $2, bench = coalesce($3::jsonb, bench), why = $4, decided_at = case when $2 in ('accepted', 'refused') then now() else decided_at end where id = $1::uuid", [t.id, status, bench ? JSON.stringify(bench) : null, why.slice(0, 500)]);
  await appendLedgerOnline(db, { org_id: t.org_id, kind: "profile_trial", task_id: null, payload: { trial_id: t.id, change_key: t.change_key, status, why: why.slice(0, 300), by: "mandat" } });
}

/** D-551: the chain of the repo's profile versions, from the current one back to the first */
export async function profileLineage(db: SqlClient, repoId: string): Promise<LineageStep[]> {
  const cur = (await db.query<{ profile_id: string | null }>("select profile_id::text as profile_id from public.repos where id = $1::uuid", [repoId])).rows[0]?.profile_id;
  if (!cur) return [];
  const versions = (await db.query<LineageVersion>("select id::text as id, version, parent_id::text as parent_id, origin, trial_id::text as trial_id, status, profile_hash from public.harness_profiles where repo_id = $1::uuid order by version desc limit 500", [repoId])).rows;
  const trials = (await db.query<LineageTrial>("select id::text as id, manifest, status, bench, why from public.profile_trials where repo_id = $1::uuid", [repoId])).rows;
  return lineage(cur, versions, trials);
}

/** "<agent>:<model>" of a task; the connection's default model is "default" */
const MODEL_OF = "t.agent || ':' || coalesce(t.model, 'default')";

/**
 * D-553: a part Mandat accepted under one model, while the tasks since then run on another, is tried without: the bench
 * with the current profile and without the part. Worse → refused (the part still earns its place). Not worse → benched:
 * removal widens, so it waits for a person; the profile never changes here. Once per part and model; one per tick.
 */
async function ablate(db: SqlClient, r: Repo, bench: BenchRunner, out: EvolveTick): Promise<void> {
  const cur = (await db.query<{ layers: unknown }>("select layers from public.harness_profiles where id = $1::uuid", [r.profile_id])).rows[0];
  const layers = ProfileLayers.safeParse(cur?.layers);
  if (!layers.success) return;
  const accepted = (await db.query<Trial>(`select ${TRIAL} from public.profile_trials where repo_id = $1::uuid and status = 'accepted' order by decided_at`, [r.id])).rows;
  for (const t of accepted) {
    const m = ProfileManifest.safeParse(t.manifest);
    // a part that can weaken (flaky, allow) is never tried without: removing it only narrows
    if (!m.success || !t.decided_at || weakens(m.data.change)) continue;
    const then = (await db.query<{ m: string }>(`select ${MODEL_OF} as m from public.tasks t where t.id = any($1::text[]) group by 1 order by count(*) desc, 1 limit 1`, [m.data.evidence])).rows[0]?.m ?? null;
    const now = (await db.query<{ m: string }>(`select ${MODEL_OF} as m from public.tasks t where t.repo_id = $1::uuid and t.state_entered_at > $2::timestamptz and t.state in ('BLOCKED', 'CLOSED', 'HELD', 'GATED', 'DELIVERED', 'OUTCOME') order by t.state_entered_at desc limit 1`, [r.id, t.decided_at])).rows[0]?.m ?? null;
    const [part] = ablationCandidates([{ trial: t.id, change: m.data.change, model: then }], layers.data, now);
    if (!part || !now) continue;
    const key = `ablate|${m.data.change.rule}|${m.data.change.detail}|${now}`.slice(0, 300);
    if ((await db.query("select 1 from public.profile_trials where repo_id = $1::uuid and change_key = $2", [r.id, key])).rows.length > 0) continue;
    const without = removeChange(layers.data, m.data.change);
    const [before, after] = [await bench(layers.data, m.data.prediction.task_type), await bench(without, m.data.prediction.task_type)];
    const lost = worse(after, before) || (before.heldout && after.heldout ? worse(after.heldout, before.heldout) : !after.heldout);
    const status = lost ? "refused" : "benched";
    const why = lost ? `without ${m.data.change.rule} the bench got worse under ${now}: the part stays` : `without ${m.data.change.rule} the bench held under ${now}: removing it widens, so it waits for a person`;
    await db.query("insert into public.profile_trials (org_id, repo_id, change_key, manifest, from_profile, status, bench, why, decided_at) values ($1::uuid, $2::uuid, $3, $4::jsonb, $5::uuid, $6, $7::jsonb, $8, case when $6 = 'refused' then now() end)", [r.org_id, r.id, key, JSON.stringify(m.data), r.profile_id, status, JSON.stringify({ before, after }), why.slice(0, 500)]);
    await appendLedgerOnline(db, { org_id: r.org_id, kind: "profile_trial", task_id: null, payload: { action: "ablation", change_key: key, status, model_then: then, model_now: now, by: "mandat" } });
    out.ablated.push(key);
    return;
  }
}
