import { randomBytes } from "node:crypto";
import type { Spec} from "@mandat/contract";
import { BringBody, JobApproveBody, JobStatus, SessionSeal, hashJcs, jcs, sha256Tag } from "@mandat/contract";
import { canAct } from "./actions";
import { hasCap } from "./roles";
import type { Result } from "./actions";
import { asService } from "./sql";
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

interface JobDbRow { id: string; status: string; question: string | null; seal: unknown; seal_hash: string | null; merged_sha: string | null; final_task_id: string | null }
interface UnitDbRow { unit_id: string; title: string; criteria: unknown; status: string; result: string | null; failing: unknown; task_id: string | null }
const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string").slice(0, 200) : []);

/** the job of the conversation as the page sees it (statuses, ids and counts; never a test) */
export async function jobView(sql: Sql, conversation: string, spec: Spec | null): Promise<JobView | null> {
  const j = (await sql.query<JobDbRow>("select id, status, question, seal, seal_hash, merged_sha, final_task_id from public.jobs where conversation_id = $1 order by created_at desc limit 1", [conversation])).rows[0];
  if (!j) return null;
  const units = (await sql.query<UnitDbRow>("select unit_id, title, criteria, status, result, failing, task_id from public.job_units where job_id = $1 order by ord", [j.id])).rows.map((u) => ({
    id: u.unit_id, title: u.title, criteria: ids(u.criteria), status: u.status, result: u.result, failing: ids(u.failing), task_id: u.task_id,
  }));
  const seal = SessionSeal.safeParse(j.seal);
  const all = spec ? spec.criteria.map((c) => c.id) : [];
  const unchecked = seal.success ? seal.data.unchecked : [];
  return {
    id: j.id, status: JobStatus.catch("failed").parse(j.status), question: j.question, units,
    current: units.find((u) => u.status === "running" || u.status === "failed" || u.status === "blocked")?.id ?? null,
    final_task_id: j.final_task_id,
    seal: seal.success && j.seal_hash ? { hash: j.seal_hash, verdict: seal.data.verdict, result_ref: seal.data.result_ref, checked: all.filter((c) => !unchecked.some((u) => u.startsWith(`${c}:`))), unchecked } : null,
    merged_sha: j.merged_sha,
  };
}

/** D-535: a person approves the sealed job (the seal's hash they saw); the worker then merges its branch into main */
export async function approveJob(db: Db, o: { uid: string; org: string; id: string; body: unknown }): Promise<Result> {
  const b = JobApproveBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  const j = (await asService(db, (sql) => sql.query<{ id: string; repo: string; status: string; seal: unknown; seal_hash: string | null }>("select id, repo_id::text as repo, status, seal, seal_hash from public.jobs where conversation_id = $1 and org_id = $2::uuid order by created_at desc limit 1", [o.id, o.org]))).rows[0];
  if (!j) return err(404, "unknown_job");
  if (!(await hasCap(db, o.uid, o.org, "approve.level1", { repo: j.repo }))) return err(403, "not_an_approver");
  if (j.status === "approved" || j.status === "delivered") return err(409, "already_approved");
  const seal = SessionSeal.safeParse(j.seal);
  // only a sealed VERIFIED job whose stored hash is the seal's own hash and the one the person saw
  if (j.status !== "sealed" || !seal.success || seal.data.verdict !== "VERIFIED" || j.seal_hash !== hashJcs(seal.data)) return err(409, "job_not_sealed");
  if (b.data.seal_hash !== j.seal_hash) return err(409, "seal_changed");
  const done = await asService(db, async (sql) => {
    const u = await sql.query("update public.jobs set status = 'approved', approved_by = $3::uuid, approved_at = now(), updated_at = now() where id = $1 and seal_hash = $2 and status = 'sealed' returning id", [j.id, j.seal_hash, o.uid]);
    if (u.rows.length === 0) return false;
    const text = jcs({ conversation: o.id, job: j.id, seal_hash: j.seal_hash, result_ref: seal.data.result_ref, by: o.uid });
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
