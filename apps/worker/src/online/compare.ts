import { Spec, specText } from "@mandat/contract";
import { compareArms, hiddenCounts } from "@mandat/core";
import type { ArmResult, Comparison } from "@mandat/core";
import type { VerdictResult } from "@mandat/contract";
import type { Db } from "./db.js";

// М4 (Х10, D-565): the final comparison of docs/prd/heavy-process.md. A job (the process: planner, units, final check)
// and one task by one agent get the same approved spec and the same approved hidden oracle; both go through the same
// sandbox, verify and verdict. The report scores them by the hidden oracle first (compareArms in core).

interface JobRow { id: string; org_id: string; repo_id: string; conversation_id: string; spec_hash: string; oracle_hash: string; type: string; agent: string; model: string | null; created_by: string | null; final_task_id: string | null; status: string }

const JOB = "select id, org_id::text as org_id, repo_id::text as repo_id, conversation_id, spec_hash, oracle_hash, type, agent, model, created_by::text as created_by, final_task_id, status from public.jobs where id = $1";
export const singleArmTask = (jobId: string): string => `t_cmp_${jobId.replace(/^j_/, "")}`.slice(0, 44);

/** the one-agent arm: one task with the job's whole spec as its text, the same spec and oracle hashes, no job */
export async function startSingleArm(db: Db, o: { job: string }): Promise<{ ok: true; task: string } | { ok: false; reason: "no_job" | "no_spec" | "exists" }> {
  const j = (await db.query<JobRow>(JOB, [o.job])).rows[0];
  if (!j) return { ok: false, reason: "no_job" };
  const c = (await db.query<{ approved_spec: unknown; approved_spec_hash: string | null }>("select approved_spec, approved_spec_hash from public.conversations where id = $1", [j.conversation_id])).rows[0];
  const spec = Spec.safeParse(c?.approved_spec);
  if (!spec.success || c?.approved_spec_hash !== j.spec_hash) return { ok: false, reason: "no_spec" };
  const id = singleArmTask(j.id);
  const ins = await db.query(
    "insert into public.tasks (id, org_id, repo_id, type, agent, model, text, created_by, spec_hash, oracle_hash, attempts_max) values ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid, $9, $10, 3) on conflict (id) do nothing returning id",
    [id, j.org_id, j.repo_id, j.type, j.agent, j.model, specText(spec.data), j.created_by, j.spec_hash, j.oracle_hash],
  );
  return ins.rows.length > 0 ? { ok: true, task: id } : { ok: false, reason: "exists" };
}

const DONE = ["CLOSED", "BLOCKED", "HELD", "GATED", "DELIVERED", "OUTCOME"];

async function verdictOf(db: Db, task: string | null): Promise<{ verdict: VerdictResult | null; passed: number; total: number; state: string | null }> {
  if (!task) return { verdict: null, passed: 0, total: 0, state: null };
  const t = (await db.query<{ state: string }>("select state from public.tasks where id = $1", [task])).rows[0];
  const v = (await db.query<{ id: string; result: VerdictResult }>("select id::text as id, result from public.verdicts where task_id = $1 order by created_at desc limit 1", [task])).rows[0];
  if (!v) return { verdict: null, passed: 0, total: 0, state: t?.state ?? null };
  const ev = (await db.query<{ detector: string; status: string; data: unknown }>("select detector, status, data from public.evidence where verdict_id = $1::uuid", [v.id])).rows;
  const h = hiddenCounts(ev);
  return { verdict: v.result, passed: h.passed, total: h.total, state: t?.state ?? null };
}

export interface CompareReport { job: string; process: ArmResult; single: ArmResult; comparison: Comparison }

export async function compareReport(db: Db, o: { job: string }): Promise<CompareReport | null> {
  const j = (await db.query<JobRow>(JOB, [o.job])).rows[0];
  if (!j) return null;
  // the process arm: its final check decides; its cost and time are every task of the job
  const p = await verdictOf(db, j.final_task_id);
  const pc = (await db.query<{ usd: number; minutes: number }>("select coalesce(sum(usd), 0)::float8 as usd, coalesce(sum(minutes), 0)::float8 as minutes from public.tasks where job_id = $1", [j.id])).rows[0];
  const process: ArmResult = { verdict: p.verdict, hidden_passed: p.passed, hidden_total: p.total, usd: pc?.usd ?? 0, minutes: pc?.minutes ?? 0, done: ["sealed", "approved", "delivered", "parked"].includes(j.status) && p.verdict !== null };
  const id = singleArmTask(j.id);
  const s = await verdictOf(db, id);
  const sc = (await db.query<{ usd: number; minutes: number }>("select coalesce(usd, 0)::float8 as usd, coalesce(minutes, 0)::float8 as minutes from public.tasks where id = $1", [id])).rows[0];
  const single: ArmResult = { verdict: s.verdict, hidden_passed: s.passed, hidden_total: s.total, usd: sc?.usd ?? 0, minutes: sc?.minutes ?? 0, done: s.verdict !== null && DONE.includes(s.state ?? "") };
  return { job: j.id, process, single, comparison: compareArms(process, single) };
}
