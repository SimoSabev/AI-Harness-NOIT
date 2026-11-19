import { EVOLVE_LIMITS, ProfileLayers, ProfileManifest, profileHash } from "@mandat/contract";
import type { ProfileLayers as Layers, TaskType } from "@mandat/contract";
import { ablationCandidates, applyChange, isNarrowing, lineage, predictionHeld, removeChange, rulesFromFailures } from "@mandat/profile";
import type { FailureRow, LineageStep, LineageTrial, LineageVersion } from "@mandat/profile";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";

// D-530 (round 2): profile evolution with evidence, the worker's tick.
// 1. propose: a recurring failure class of a project → a trial (one per change, never twice);
// 2. gate: the bench runs the same scenarios with the current and the changed profile; worse → refused; not worse and
//    narrowing → Mandat accepts it as a new approved version (the twin's rule follows the narrowing, by Simo's choice);
//    not narrowing → it waits for a person (never with the four fixed rules, which only narrow);
// 3. watch: an accepted change whose prediction the next tasks falsify is rolled back to the old layers.
export interface Score { pass: number; total: number; false_verified: number }
/** D-550: the visible scenarios plus, when run, the held-out heavy set (only its counts ever leave the gate) */
export interface BenchScore extends Score { heldout?: Score }
export type BenchRunner = (layers: Layers, taskType: TaskType) => Promise<BenchScore>;
export interface EvolveTick { proposed: string[]; accepted: string[]; refused: string[]; rolledBack: string[]; /** D-553: removal trials benched this tick */ ablated: string[] }

interface Repo { id: string; org_id: string; profile_id: string; version: number; layers: unknown }
interface Trial { id: string; org_id: string; repo_id: string; change_key: string; manifest: unknown; from_profile: string; to_profile: string | null; decided_at: string | null }

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

export async function evolveTick(db: SqlClient, o: { now: Date; bench?: BenchRunner; /** D-550: no held-out counts → nothing is accepted by itself */ requireHeldout?: boolean }): Promise<EvolveTick> {
  const out: EvolveTick = { proposed: [], accepted: [], refused: [], rolledBack: [], ablated: [] };
  for (const r of (await db.query<Repo>(REPOS)).rows) {
    const layers = ProfileLayers.safeParse(r.layers);
    if (!layers.success) continue;
    await propose(db, r, layers.data, o.now, out);
    if (o.bench) await gate(db, r, layers.data, o.bench, out, o.requireHeldout ?? false);
    await watch(db, r, out);
    if (o.bench && out.accepted.length === 0 && out.rolledBack.length === 0) await ablate(db, r, o.bench, out);
  }
  return out;
}

async function propose(db: SqlClient, r: Repo, layers: Layers, now: Date, out: EvolveTick): Promise<void> {
  const since = new Date(now.getTime() - EVOLVE_LIMITS.window_days * 86_400_000).toISOString();
  const rows = rowsOf((await db.query<{ task_id: string; task_type: TaskType; at: string; reasons: unknown }>(ROWS, [r.id, since])).rows);
  for (const m of rulesFromFailures(rows, layers, now.toISOString())) {
    const ins = await db.query("insert into public.profile_trials (org_id, repo_id, change_key, manifest, from_profile) values ($1::uuid, $2::uuid, $3, $4::jsonb, $5::uuid) on conflict (repo_id, change_key) do nothing returning id", [r.org_id, r.id, keyOf(m), JSON.stringify(m), r.profile_id]);
    if (ins.rows.length === 0) continue;
    await appendLedgerOnline(db, { org_id: r.org_id, kind: "profile_trial", task_id: null, payload: { status: "proposed", change: m.change, reason_class: m.reason_class, evidence: m.evidence.length, prediction: m.prediction, by: "mandat" } });
    out.proposed.push(keyOf(m));
  }
}

async function gate(db: SqlClient, r: Repo, layers: Layers, bench: BenchRunner, out: EvolveTick, requireHeldout: boolean): Promise<void> {
  const open = (await db.query<Trial>("select id::text as id, org_id::text as org_id, repo_id::text as repo_id, change_key, manifest, from_profile::text as from_profile, to_profile::text as to_profile, decided_at::text as decided_at from public.profile_trials where repo_id = $1::uuid and status = 'proposed' order by created_at", [r.id])).rows;
  for (const t of open) {
    const m = ProfileManifest.safeParse(t.manifest);
    if (!m.success) continue;
    const candidate = applyChange(layers, m.data.change);
    const type = m.data.prediction.task_type;
    const [before, after] = [await bench(layers, type), await bench(candidate, type)];
    const scores = { before, after };
    if (worse(after, before)) {
      await decide(db, t, "refused", scores, `the bench got worse: ${after.pass}/${after.total} vs ${before.pass}/${before.total}`);
      out.refused.push(t.change_key);
      continue;
    }
    // D-550: the held-out heavy set is the second gate; the rules never come from it, so it cannot be fitted
    if (before.heldout && after.heldout && worse(after.heldout, before.heldout)) {
      await decide(db, t, "refused", scores, `the held-out bench got worse: ${after.heldout.pass}/${after.heldout.total} vs ${before.heldout.pass}/${before.heldout.total}`);
      out.refused.push(t.change_key);
      continue;
    }
    if (requireHeldout && (!before.heldout || !after.heldout)) {
      await decide(db, t, "benched", scores, "the held-out bench did not run: waits for a person");
      continue;
    }
    if (!isNarrowing(layers, candidate)) {
      await decide(db, t, "benched", scores, "not narrowing: waits for a person");
      continue;
    }
    const to = await newVersion(db, r, candidate, { action: "evolve", trial: t.id });
    await db.query("update public.profile_trials set to_profile = $2::uuid where id = $1::uuid", [t.id, to]);
    await decide(db, t, "accepted", scores, `${m.data.reason_class} ×${m.data.evidence.length}; the bench held: ${after.pass}/${after.total}`);
    out.accepted.push(t.change_key);
    return; // one change per tick: the next trial is benched against the new profile
  }
}

async function watch(db: SqlClient, r: Repo, out: EvolveTick): Promise<void> {
  const live = (await db.query<Trial>("select id::text as id, org_id::text as org_id, repo_id::text as repo_id, change_key, manifest, from_profile::text as from_profile, to_profile::text as to_profile, decided_at::text as decided_at from public.profile_trials where repo_id = $1::uuid and status = 'accepted' and to_profile = $2::uuid", [r.id, r.profile_id])).rows;
  for (const t of live) {
    const m = ProfileManifest.safeParse(t.manifest);
    if (!m.success || !t.decided_at) continue;
    const later = rowsOf((await db.query<{ task_id: string; task_type: TaskType; at: string; reasons: unknown }>(ROWS, [r.id, t.decided_at])).rows);
    const p = predictionHeld(m.data, later);
    if (p.held) continue;
    const old = (await db.query<{ layers: unknown }>("select layers from public.harness_profiles where id = $1::uuid", [t.from_profile])).rows[0];
    const back = ProfileLayers.safeParse(old?.layers);
    if (!back.success) continue;
    await newVersion(db, r, back.data, { action: "evolve_rollback", trial: t.id });
    await decide(db, t, "rolled_back", null, `the prediction failed: ${m.data.reason_class} came back ${p.repeats}× in ${p.seen} task(s)`);
    out.rolledBack.push(t.change_key);
    return;
  }
}

/** A new approved version of the repo's profile in one transaction; the old one superseded; twin rules follow its hash. */
async function newVersion(db: SqlClient, r: Repo, layers: Layers, why: { action: string; trial: string }): Promise<string> {
  const hash = profileHash(layers);
  await db.query("begin");
  try {
    const old = (await db.query<{ profile_hash: string }>("select profile_hash from public.harness_profiles where id = $1::uuid", [r.profile_id])).rows[0];
    const v = (await db.query<{ v: number }>("select coalesce(max(version), 0) + 1 as v from public.harness_profiles where repo_id = $1::uuid", [r.id])).rows[0]?.v ?? r.version + 1;
    // D-551: the new version names its parent, how it came and the trial behind it (the archive keeps the old one)
    const ins = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at, parent_id, origin, trial_id) values ($1::uuid, $2::uuid, $3, $4::jsonb, '{}', $5, 'approved', now(), $6::uuid, $7, $8::uuid) returning id::text as id", [r.org_id, r.id, v, JSON.stringify(layers), hash, r.profile_id, why.action, why.trial]);
    const id = ins.rows[0]?.id as string;
    await db.query("update public.harness_profiles set status = 'superseded' where id = $1::uuid and status = 'approved'", [r.profile_id]);
    await db.query("update public.repos set profile_id = $2::uuid where id = $1::uuid", [r.id, id]);
    if (old) await db.query("update public.twin_rules set policy_hash = $3 where org_id = $1::uuid and policy_hash = $2 and revoked_at is null", [r.org_id, old.profile_hash, hash]);
    await appendLedgerOnline(db, { org_id: r.org_id, kind: "profile_change", task_id: null, payload: { action: why.action, trial_id: why.trial, profile_id: id, profile_hash: hash, version: v, by: "mandat" } });
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
  const accepted = (await db.query<Trial>("select id::text as id, org_id::text as org_id, repo_id::text as repo_id, change_key, manifest, from_profile::text as from_profile, to_profile::text as to_profile, decided_at::text as decided_at from public.profile_trials where repo_id = $1::uuid and status = 'accepted' order by decided_at", [r.id])).rows;
  for (const t of accepted) {
    const m = ProfileManifest.safeParse(t.manifest);
    if (!m.success || !t.decided_at) continue;
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
