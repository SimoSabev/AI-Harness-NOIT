import { randomBytes } from "node:crypto";
import type { Spec, VerdictResult } from "@mandat/contract";
import { BringBody, JobApproveBody, JobRoles, JobStatus, SessionSeal, TaskAxes, TaskProfileId, hashJcs, jcs, roleRoute, sha256Tag } from "@mandat/contract";
import { hiddenCounts, unitWaves } from "@mandat/core";
import { singleArmTask } from "@mandat/worker";
import { gateRows, strategyReasons } from "../job-strategy";
import { canAct, factorAt } from "./actions";
import { hasCap } from "./roles";
import type { Result, SecondFactor } from "./actions";
import { asService, asUser } from "./sql";
import type { Db, Sql } from "./sql";
import type { JobView } from "../conversation-types";
import type { KeysClient } from "./keys";

// D-535 (M1 X6/X7 minimum): the web's side of a job. "Start work" on an approved spec with an approved oracle makes a
// job (the worker plans it and builds it unit by unit on its own branch); the page shows the plan, the current unit,
// each unit's verdict, a parked question and the seal; one person's approval of the seal lets the worker merge the job
// branch into main. Nothing of a job reaches main without the seal and that approval.

const err = (status: number, error: string): Result => ({ status, body: { error } });

/** a new job of the conversation: its spec and oracle hashes are the approved ones (checked by the caller) */
export async function createJob(db: Db, o: { uid: string; org: string; conversation: string; specHash: string; oracleHash: string; type: string; agent: string; model: string | null }): Promise<Result> {
  if (!(await canAct(db, o.uid, o.org))) return err(403, "not_an_approver");
  const id = `j_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const ok = await asService(db, async (sql) => {
    // the job's project is the approved oracle's (its tests were checked on that project's code)
    const r = await sql.query(
      "insert into public.jobs (id, org_id, repo_id, conversation_id, spec_hash, oracle_hash, type, agent, model, created_by) select $1, $2::uuid, o.repo_id, $3, $4, $5, $6, $7, $8, $9::uuid from public.oracles o where o.conversation_id = $3 and o.oracle_hash = $5 and o.status = 'approved' and o.repo_id is not null order by o.approved_at desc limit 1 returning id",
      [id, o.org, o.conversation, o.specHash, o.oracleHash, o.type, o.agent, o.model, o.uid],
    );
    if (r.rows.length === 0) return false;
    await sql.query("update public.conversations set phase = 'work', job_id = $2, updated_at = now() where id = $1", [o.conversation, id]);
    return true;
  });
  if (!ok) return err(409, "oracle_not_approved");
  return { status: 201, body: { job: id, state: "planning" } };
}

interface JobDbRow { id: string; status: string; question: string | null; seal: unknown; seal_hash: string | null; merged_sha: string | null; final_task_id: string | null; mode: string; pilot_state: string; roles: unknown; agent: string; model: string | null; oracle_hash: string | null; axes: unknown; profile: string | null }
interface UnitDbRow { unit_id: string; title: string; criteria: unknown; status: string; result: string | null; failing: unknown; task_id: string | null; depends_on: unknown; pilot: boolean; task_state: string | null; attempt: number | null }
const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string").slice(0, 200) : []);

/** the job of the conversation as the page sees it (statuses, ids and counts; never a test) */
export async function jobView(sql: Sql, conversation: string, spec: Spec | null): Promise<JobView | null> {
  const j = (await sql.query<JobDbRow>("select j.id, j.status, j.question, j.seal, j.seal_hash, j.merged_sha, j.final_task_id, j.mode, j.pilot_state, j.roles, j.agent, j.model, j.oracle_hash, c.axes, c.profile from public.jobs j left join public.conversations c on c.id = j.conversation_id where j.conversation_id = $1 order by j.created_at desc limit 1", [conversation])).rows[0];
  if (!j) return null;
  const rows = (await sql.query<UnitDbRow>("select u.unit_id, u.title, u.criteria, u.status, u.result, u.failing, u.task_id, u.depends_on, u.pilot, t.state as task_state, t.attempt from public.job_units u left join public.tasks t on t.id = u.task_id where u.job_id = $1 order by u.ord", [j.id])).rows;
  // D-558: the wave of each unit (units of one wave run at once in waves mode)
  const wave = unitWaves(rows.map((u) => ({ id: u.unit_id, depends_on: ids(u.depends_on) })));
  const units = rows.map((u) => ({
    id: u.unit_id, title: u.title, criteria: ids(u.criteria), status: u.status, result: u.result, failing: ids(u.failing), task_id: u.task_id,
    wave: wave[u.unit_id] ?? 0, pilot: u.pilot, copy: u.task_id && u.task_state ? { task: u.task_id, attempt: u.attempt ?? 1, state: u.task_state } : null,
  }));
  const seal = SessionSeal.safeParse(j.seal);
  const all = spec ? spec.criteria.map((c) => c.id) : [];
  const unchecked = seal.success ? seal.data.unchecked : [];
  return {
    id: j.id, status: JobStatus.catch("failed").parse(j.status), question: j.question, units,
    current: units.find((u) => u.status === "running" || u.status === "failed" || u.status === "blocked" || u.status === "parked")?.id ?? null,
    final_task_id: j.final_task_id,
    seal: seal.success && j.seal_hash ? { hash: j.seal_hash, verdict: seal.data.verdict, result_ref: seal.data.result_ref, checked: all.filter((c) => !unchecked.some((u) => u.startsWith(`${c}:`))), unchecked } : null,
    merged_sha: j.merged_sha,
    strategy: strategyOf(j, units),
    gates: gateRows(await finalEvidence(sql, j.final_task_id)),
    compare: await compareArm(sql, j.id),
  };
}

/** D-615: M4's single-agent arm of this job, if it was started (`mandat compare start`): who runs it and how it ended */
async function compareArm(sql: Sql, job: string): Promise<JobView["compare"]> {
  const t = (await sql.query<{ id: string; agent: string; model: string | null; state: string }>("select id, agent, model, state from public.tasks where id = $1 and kind = 'compare'", [singleArmTask(job)])).rows[0];
  if (!t) return null;
  const v = (await sql.query<{ id: string; result: VerdictResult }>("select id::text as id, result from public.verdicts where task_id = $1 order by created_at desc limit 1", [t.id])).rows[0];
  const h = v ? hiddenCounts((await sql.query<{ detector: string; status: string; data: unknown }>("select detector, status, data from public.evidence where verdict_id = $1::uuid", [v.id])).rows) : { passed: 0, total: 0 };
  return { task: t.id, agent: t.agent, model: t.model, state: t.state, verdict: v?.result ?? null, ...h };
}

function strategyOf(j: JobDbRow, units: { wave: number; pilot: boolean }[]): JobView["strategy"] {
  const mode = j.mode === "waves" ? "waves" : "single";
  const axes = TaskAxes.safeParse(j.axes);
  const roles = JobRoles.safeParse(j.roles);
  const route = (role: "planner" | "writer" | "advisor") => ({ role, ...roleRoute({ agent: j.agent, model: j.model }, roles.success ? roles.data : null, role) });
  const pilot = units.filter((u) => u.pilot).length;
  const profile = TaskProfileId.safeParse(j.profile);
  return {
    profile: profile.success ? profile.data : null, mode, waves: units.length === 0 ? 0 : Math.max(...units.map((u) => u.wave)) + 1,
    pilot: pilot > 0 ? { units: pilot, state: j.pilot_state } : null,
    roles: [route("planner"), route("writer"), route("advisor")],
    reasons: strategyReasons({ axes: axes.success ? axes.data : null, mode, pilot, oracle: j.oracle_hash !== null }),
  };
}

/** the evidence of the final check's latest verdict (detector and status only) */
async function finalEvidence(sql: Sql, task: string | null): Promise<{ detector: string; status: string }[] | null> {
  if (!task) return null;
  const v = (await sql.query<{ id: string }>("select id::text as id from public.verdicts where task_id = $1 order by created_at desc limit 1", [task])).rows[0];
  if (!v) return null;
  return (await sql.query<{ detector: string; status: string }>("select detector, status from public.evidence where verdict_id = $1::uuid", [v.id])).rows;
}

/** D-535: a person approves the sealed job (the seal's hash they saw); the worker then merges its branch into main */
export async function approveJob(db: Db, o: { uid: string; org: string; id: string; body: unknown; secondFactor?: SecondFactor }): Promise<Result> {
  const b = JobApproveBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  const j = (await asService(db, (sql) => sql.query<{ id: string; repo: string; status: string; seal: unknown; seal_hash: string | null }>("select id, repo_id::text as repo, status, seal, seal_hash from public.jobs where conversation_id = $1 and org_id = $2::uuid order by created_at desc limit 1", [o.id, o.org]))).rows[0];
  if (!j) return err(404, "unknown_job");
  if (!(await hasCap(db, o.uid, o.org, "approve.level1", { repo: j.repo }))) return err(403, "not_an_approver");
  if (j.status === "approved" || j.status === "delivered") return err(409, "already_approved");
  const seal = SessionSeal.safeParse(j.seal);
  // only a sealed job whose stored hash is the seal's own hash and the one the person saw; D-598: VERIFIED, or UNKNOWN
  // (only surviving mutants or slower tests are open, the worker decides that) with the person's fresh second factor
  if (j.status !== "sealed" || !seal.success || seal.data.verdict === "FAILED" || j.seal_hash !== hashJcs(seal.data)) return err(409, "job_not_sealed");
  if (b.data.seal_hash !== j.seal_hash) return err(409, "seal_changed");
  let method: "tap" | "totp" | "local" = "tap";
  if (seal.data.verdict === "UNKNOWN") {
    if (!o.secondFactor) return err(403, "second_factor_required");
    const f = await factorAt(o.secondFactor, { uid: o.uid, code: b.data.code, factorId: b.data.factor_id });
    if (!("at" in f)) return f;
    method = f.method;
  }
  const done = await asService(db, async (sql) => {
    const u = await sql.query("update public.jobs set status = 'approved', approved_by = $3::uuid, approved_at = now(), updated_at = now() where id = $1 and seal_hash = $2 and status = 'sealed' returning id", [j.id, j.seal_hash, o.uid]);
    if (u.rows.length === 0) return false;
    // D-598: an UNKNOWN seal's approval keeps its verdict and how the person confirmed it
    const text = jcs({ conversation: o.id, job: j.id, seal_hash: j.seal_hash, result_ref: seal.data.result_ref, by: o.uid, ...(seal.data.verdict === "UNKNOWN" ? { verdict: "UNKNOWN", method } : {}) });
    await sql.query("select private.ledger_append($1::uuid, 'job_approved', null, $2, $3)", [o.org, text, sha256Tag(text)]);
    return true;
  });
  if (!done) return err(409, "already_approved");
  return { status: 200, body: { job: j.id, seal_hash: j.seal_hash } };
}

/**
 * D-540: "Bring into my folder" — after the job is merged into the mirror's main, a person who may approve asks
 * `mandat local` to fast-forward the project's own folder to the merged commit. The control endpoint checks the folder
 * (source folder, branch, clean, no divergence) and refuses with a reason otherwise; the ledger keeps hashes, no path.
 */
const BringRequest = BringBody.pick({ branch: true }).strict();
export async function bringJob(db: Db, keys: KeysClient | undefined, o: { uid: string; org: string; id: string; body: unknown }): Promise<Result> {
  const b = BringRequest.safeParse(o.body ?? {});
  if (!b.success) return err(400, "bad_body");
  const j = (await asService(db, (sql) => sql.query<{ id: string; repo: string; status: string; merged_sha: string | null; provider: string; remote_url: string }>(
    "select j.id, j.repo_id::text as repo, j.status, j.merged_sha, r.provider, r.remote_url from public.jobs j join public.repos r on r.id = j.repo_id where j.conversation_id = $1 and j.org_id = $2::uuid order by j.created_at desc limit 1",
    [o.id, o.org],
  ))).rows[0];
  if (!j) return err(404, "unknown_job");
  if (!(await hasCap(db, o.uid, o.org, "approve.level1", { repo: j.repo }))) return err(403, "not_an_approver");
  if (j.status !== "delivered" || !j.merged_sha) return err(409, "job_not_delivered");
  const mirror = j.provider === "local" && j.remote_url.startsWith("file://") ? j.remote_url.slice("file://".length) : null;
  const body = mirror ? BringBody.safeParse({ mirror, sha: j.merged_sha, ...(b.data.branch ? { branch: b.data.branch } : {}) }) : null;
  if (!body?.success) return err(409, "not_local");
  if (!keys?.bring) return err(503, "control_unavailable");
  const r = await keys.bring(body.data);
  if (!r) return err(503, "control_unavailable");
  if (r.ok && r.from !== r.to) {
    const text = jcs({ conversation: o.id, job: j.id, from: r.from, to: r.to, folder: sha256Tag(r.folder), by: o.uid });
    await asService(db, (sql) => sql.query("select private.ledger_append($1::uuid, 'folder_updated', null, $2, $3)", [o.org, text, sha256Tag(text)]));
  }
  return { status: 200, body: { result: r } };
}

/**
 * D-710: the whole change of the conversation's sealed (or approved, or merged) job — its current final check's own
 * export (job_diffs, D-708), read as the person (approver+ by RLS). Only the text whose sha256 is the final verdict's
 * diff_hash counts as the change; anything else is refused. Its own route, not the feed (that reloads every 400 ms).
 */
export async function jobDiff(db: Db, uid: string, conversation: string): Promise<Result> {
  return asUser(db, uid, async (sql) => {
    const r = await sql.query<{ diff: string; omitted_bytes: string | null; diff_hash: string | null }>(
      `select d.diff, d.omitted_bytes::text as omitted_bytes, d.diff_hash from public.jobs j join public.job_diffs d on d.task_id = j.final_task_id
        where j.conversation_id = $1 and j.status in ('sealed', 'approved', 'delivered') order by j.created_at desc limit 1`,
      [conversation],
    );
    const row = r.rows[0];
    if (!row) return err(404, "no_diff");
    if (row.omitted_bytes !== null) return { status: 200, body: { diff: "", omitted_bytes: Number(row.omitted_bytes) } };
    if (row.diff_hash === null || sha256Tag(Buffer.from(row.diff, "utf8")) !== row.diff_hash) return err(409, "diff_changed");
    return { status: 200, body: { diff: row.diff, omitted_bytes: null } };
  });
}
