import { ADVISOR_SYSTEM, Handoff, RELAND_MAX, RESCUE_MAX, RESCUE_TRIES, advisorUser, rescueTaskText, unitTaskText } from "@mandat/contract";
import type { Spec } from "@mandat/contract";
import type { JobMode } from "@mandat/core";
import { appendLedgerOnline } from "@mandat/ledger";
import { inTransaction } from "./db.js";
import type { Db } from "./db.js";
import type { JobDeps } from "./job.js";
import { selfMoveOf } from "./self-finish.js";

// D-541/D-542 (М2 Х6): one unit of a running job, settled on each tick. A unit whose tasks still work waits; one that
// no longer applies onto the moved branch is built again (waves); one that failed after its normal attempts is rescued
// once (a model's advice, RESCUE_TRIES fresh tries at once); after that it waits for a person with its own question,
// and the job goes on with whatever does not need it.

export interface JobRow {
  id: string; org_id: string; repo_id: string; conversation_id: string; spec_hash: string; oracle_hash: string; type: string; agent: string; model: string | null;
  status: string; mode: string; base_sha: string | null; head_sha: string | null; converge_round: number; final_task_id: string | null; seal: unknown; seal_hash: string | null; created_by: string | null;
  remote_url: string; provider: string;
}
export interface UnitRow {
  unit_id: string; ord: number; title: string; criteria: string[]; depends_on: string[]; status: string; task_id: string | null; handoff: unknown; failing: string[];
  relands: number; rescues: number; tries: string[]; question: string | null;
}
export const UNIT_COLS = "unit_id, ord, title, criteria, depends_on, status, task_id, handoff, failing, relands, rescues, tries, question";

/** the advisor's spend per rescue (the proxy counts it like the planner's) */
export const ADVISE_BUDGET_USD = 0.3;

export const taskIdOf = (job: string, tail: string): string => `t_j${job.slice(2)}_${tail}`;

export async function insertTask(db: Db, j: JobRow, o: { id: string; text: string; unit: string | null; role: "unit" | "final"; attemptsMax?: number }): Promise<void> {
  await db.query(
    "insert into public.tasks (id, org_id, repo_id, type, agent, model, text, created_by, spec_hash, oracle_hash, job_id, unit_id, job_role, attempts_max) values ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid, $9, $10, $11, $12, $13, $14) on conflict (id) do nothing",
    [o.id, j.org_id, j.repo_id, j.type, j.agent, j.model, o.text, j.created_by, j.spec_hash, j.oracle_hash, j.id, o.unit, o.role, o.attemptsMax ?? 3],
  );
}

export const handoffOf = (raw: unknown): Handoff[] => {
  const h = Handoff.safeParse(raw !== null && typeof raw === "object" ? Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "commit")) : null);
  return h.success ? [h.data] : [];
};

/** the handoffs of the units that passed before this one (the progress a fresh context gets) */
export const doneBefore = (units: readonly UnitRow[], ord: number): Handoff[] => units.filter((u) => u.ord < ord && u.status === "passed").flatMap((u) => handoffOf(u.handoff));

interface TaskState { id: string; state: string; attempt: number; wait_reason: string | null; last_result: string | null }

async function stoppedTasks(d: JobDeps, ids: readonly string[]): Promise<TaskState[] | null> {
  const tasks = (await d.db.query<TaskState>("select id, state, attempt, wait_reason, last_result from public.tasks where id = any($1::text[])", [ids])).rows;
  if (tasks.length < ids.length) return null;
  const now = (d.now ?? (() => new Date()))();
  for (const t of tasks) {
    if (t.state === "CLOSED") continue;
    if ((t.state === "BLOCKED" || t.state === "HELD") && !["retry", "wait"].includes((await selfMoveOf(d.db, t.id, now)) ?? "ask")) continue;
    return null;
  }
  return tasks;
}

/** the unit as it stands after this tick (the rows in the database are updated to match) */
export async function settleUnit(d: JobDeps, j: JobRow, spec: Spec, mode: JobMode, u: UnitRow, units: readonly UnitRow[]): Promise<UnitRow> {
  if (!u.task_id || u.status === "passed" || u.status === "parked") return u;
  const ids = u.tries.length > 0 ? u.tries : [u.task_id];
  const tasks = await stoppedTasks(d, ids);
  if (!tasks) return u;
  const last = tasks.find((t) => t.id === u.task_id) ?? tasks[0];
  if (mode === "waves" && ids.length === 1 && last?.state === "BLOCKED" && (last.wait_reason ?? "").startsWith("job_branch_") && u.relands < RELAND_MAX) return reland(d.db, j, u, last.wait_reason ?? "");
  if (u.rescues < RESCUE_MAX && tasks.some((t) => t.last_result === "FAILED")) {
    const r = await rescue(d, j, spec, u, units);
    if (r) return r;
  }
  return parkUnit(d.db, j, u, last);
}

async function reland(db: Db, j: JobRow, u: UnitRow, why: string): Promise<UnitRow> {
  // another unit landed first and this one no longer applies: a fresh task builds it again on the new head
  const relands = u.relands + 1;
  await inTransaction(db, async (tx) => {
    await tx.query("update public.job_units set status = 'pending', task_id = null, tries = '[]'::jsonb, relands = $3, updated_at = now() where job_id = $1 and unit_id = $2", [j.id, u.unit_id, relands]);
    await appendLedgerOnline(tx, { org_id: j.org_id, kind: "unit_relanded", task_id: u.task_id, payload: { job: j.id, unit: u.unit_id, why, relands } });
  });
  return { ...u, status: "pending", task_id: null, tries: [], relands };
}

async function adviceFor(d: JobDeps, j: JobRow, spec: Spec, u: UnitRow): Promise<string | null> {
  const now = d.now ?? (() => new Date());
  const choice = d.modelFor({ id: j.id, agent: j.agent, model: j.model, budgetUsd: ADVISE_BUDGET_USD, expiresAt: Math.floor(now().getTime() / 1000) + 3600 });
  if (!choice.ok) return null;
  const reasons = (await d.db.query<{ reasons: string[] }>("select reasons from public.verdicts where task_id = $1 order by created_at desc limit 1", [u.task_id])).rows[0]?.reasons ?? [];
  const notes = handoffOf(u.handoff).map((h) => `done: ${h.done}; deviations: ${h.deviations.join("; ") || "-"}; risks: ${h.risks.join("; ") || "-"}`).join("\n");
  try {
    const text = (await choice.client.complete({ system: ADVISOR_SYSTEM, user: advisorUser(spec, { id: u.unit_id, title: u.title, criteria: u.criteria }, u.failing, reasons, notes), maxTokens: 800, json: false })).text.trim();
    return text === "" ? null : text;
  } catch (e) {
    d.log?.(`[job] ${j.id}: advisor failed: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    return null;
  }
}

async function rescue(d: JobDeps, j: JobRow, spec: Spec, u: UnitRow, units: readonly UnitRow[]): Promise<UnitRow | null> {
  const advice = await adviceFor(d, j, spec, u);
  if (!advice) return null;
  const rescues = u.rescues + 1;
  const base = unitTaskText(spec, { id: u.unit_id, title: u.title, criteria: u.criteria }, doneBefore(units, u.ord));
  const ids = Array.from({ length: RESCUE_TRIES }, (_, n) => taskIdOf(j.id, `${u.ord}x${rescues}${String.fromCharCode(97 + n)}`));
  // one attempt each: the tries are the retries now (self-finish does not multiply them)
  for (const [n, id] of ids.entries()) await insertTask(d.db, j, { id, text: rescueTaskText(base, advice, n), unit: u.unit_id, role: "unit", attemptsMax: 1 });
  await inTransaction(d.db, async (tx) => {
    await tx.query("update public.job_units set status = 'running', task_id = $3, tries = $4::jsonb, rescues = $5, updated_at = now() where job_id = $1 and unit_id = $2", [j.id, u.unit_id, ids[0], JSON.stringify(ids), rescues]);
    // ids and counts only: never the advice (model text) or a criterion's words
    await appendLedgerOnline(tx, { org_id: j.org_id, kind: "unit_rescued", task_id: u.task_id, payload: { job: j.id, unit: u.unit_id, tries: ids.length, rescues, failing: u.failing } });
  });
  return { ...u, status: "running", task_id: ids[0] ?? null, tries: ids, rescues };
}

async function parkUnit(db: Db, j: JobRow, u: UnitRow, last: TaskState | undefined): Promise<UnitRow> {
  const failing = u.failing.length > 0 ? ` Criteria still failing: ${u.failing.join(", ")}.` : "";
  const rescued = u.rescues > 0 ? ` A rescue with a reviewer's advice and ${u.tries.length} fresh tries did not pass either.` : "";
  const question = `Unit ${u.unit_id} ("${u.title}") stopped after ${last?.attempt ?? 1} attempt(s) (${last?.wait_reason ?? last?.state ?? "stopped"}).${rescued}${failing} Look at the unit's task and tell Mandat how to go on.`.slice(0, 2000);
  await inTransaction(db, async (tx) => {
    await tx.query("update public.job_units set status = 'parked', question = $3, updated_at = now() where job_id = $1 and unit_id = $2", [j.id, u.unit_id, question]);
    await appendLedgerOnline(tx, { org_id: j.org_id, kind: "parked", task_id: u.task_id, payload: { job: j.id, unit: u.unit_id, why: "unit_stopped", attempt: last?.attempt ?? 1, rescues: u.rescues, failing: u.failing } });
  });
  return { ...u, status: "parked", question };
}
