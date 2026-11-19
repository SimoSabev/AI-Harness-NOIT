import { randomBytes } from "node:crypto";
import { CONVERGE_ROUNDS, JOB_PARALLEL_MAX, PLAN_ROUNDS, PlanProposal, Spec, TaskAxes, hashJcs, jobBranch, plannerSystem, plannerUser, unitTaskText, withFiles, withPlaybook, SITES_MAX } from "@mandat/contract";
import type { PlanProblem, PlanUnit, Sha256, VerdictResult } from "@mandat/contract";
import { deriveProfile, failingCriteria, jobMode, pilotSize, pilotUnits, sealFor, siteTable, unitWaves, unitsToStart, validatePlan, validateSites } from "@mandat/core";
import type { JobMode, SiteRow } from "@mandat/core";
import { appendLedgerOnline } from "@mandat/ledger";
import type { ChatModelChoice, ChatRoute } from "./conversation-host.js";
import { jsonObjects } from "./conversation.js";
import { inTransaction } from "./db.js";
import type { Db } from "./db.js";
import { mergeLocal } from "./deliver-local.js";
import { findSites, startJobBranch } from "./job-branch.js";
import { UNIT_COLS, doneBefore, insertTask, routeOf, settleUnit, taskIdOf, tunePilot } from "./job-unit.js";
import type { JobRow, UnitRow } from "./job-unit.js";

// D-535 (М1 Х6/Х7 minimum): the job's tick. planning → the planner (a model, no sandbox, like the conversation) proposes
// units and core checks them; running → one unit at a time, each a new task; converging → the final check against the
// full oracle, then new units for exactly the criteria still red, or the seal; approved → the branch goes into main
// through the local delivery. Anything a person must decide parks the job with a question.

export interface JobDeps { db: Db; modelFor: (r: ChatRoute) => ChatModelChoice; log?: (line: string) => void; now?: () => Date }
export interface JobTick { planned: string[]; started: string[]; parked: string[]; sealed: string[]; merged: string[] }

/** the planner's spend per job (the proxy counts it against this budget, like a conversation) */
export const PLAN_BUDGET_USD = 0.5;


const JOB_COLS = `j.id, j.org_id::text as org_id, j.repo_id::text as repo_id, j.conversation_id, j.spec_hash, j.oracle_hash, j.type, j.agent, j.model, j.status, j.mode, j.pilot_state, j.playbook, j.sites, j.base_sha, j.head_sha,
  j.converge_round, j.final_task_id, j.seal, j.seal_hash, j.created_by::text as created_by, j.roles, r.remote_url, r.provider`;
const mirrorOf = (j: JobRow) => j.remote_url.replace(/^file:\/\//, "");
const RUNNING = new Set<string>();

export const newJobId = (): string => `j_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;

async function specOf(db: Db, j: JobRow): Promise<Spec | null> {
  const r = (await db.query<{ approved_spec: unknown; approved_spec_hash: string | null }>("select approved_spec, approved_spec_hash from public.conversations where id = $1", [j.conversation_id])).rows[0];
  const s = Spec.safeParse(r?.approved_spec);
  return s.success && r?.approved_spec_hash === j.spec_hash ? s.data : null;
}

/** parked: a question in plain words for the person (ids, counts and reasons; never a hidden test) */
async function park(db: Db, j: JobRow, question: string, payload: Record<string, unknown>): Promise<void> {
  await inTransaction(db, async (tx) => {
    await tx.query("update public.jobs set status = 'parked', question = $2, updated_at = now() where id = $1", [j.id, question.slice(0, 2000)]);
    await appendLedgerOnline(tx, { org_id: j.org_id, kind: "parked", task_id: null, payload: { job: j.id, ...payload } });
  });
}

export async function planJob(d: JobDeps, j: JobRow): Promise<"planned" | "parked"> {
  const spec = await specOf(d.db, j);
  if (!spec) {
    await park(d.db, j, "The approved spec of this job changed or is gone. Approve the spec again and start a new job.", { why: "spec_missing" });
    return "parked";
  }
  const now = d.now ?? (() => new Date());
  const choice = d.modelFor({ id: j.id, ...routeOf(j, "planner"), budgetUsd: PLAN_BUDGET_USD, expiresAt: Math.floor(now().getTime() / 1000) + 3600 });
  if (!choice.ok) {
    await park(d.db, j, `The planner could not start: ${choice.why}. Pick another agent or model and start again.`, { why: "no_model" });
    return "parked";
  }
  // D-541: the axes the person approved decide whether a team builds it (waves) or one writer (single)
  const axes = TaskAxes.safeParse((await d.db.query<{ axes: unknown }>("select axes from public.conversations where id = $1", [j.conversation_id])).rows[0]?.axes);
  const mode = jobMode(axes.success ? axes.data : null);
  // D-546: a migration (the approved spec's profile or the axes) finds its sites in the code
  const migration = spec.profile === "migration" || (axes.success && deriveProfile(axes.data).id === "migration");
  let problems: PlanProblem[] = [];
  let units: PlanUnit[] | null = null;
  let sites: SiteRow[] | null = null;
  let rounds = 0;
  for (; rounds < PLAN_ROUNDS && !units; rounds++) {
    let text: string;
    try {
      text = (await choice.client.complete({ system: plannerSystem(mode, { migration }), user: plannerUser(spec, problems.slice(0, 50)), maxTokens: 4000, json: true })).text;
    } catch (e) {
      d.log?.(`[job] ${j.id}: planner failed: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
      break;
    }
    const proposal = jsonObjects(text).map((o) => PlanProposal.safeParse(o)).filter((p) => p.success).pop();
    if (!proposal?.success) {
      problems = [{ kind: "bad_schema", id: "units" }];
      continue;
    }
    problems = validatePlan(spec, proposal.data.units);
    if (problems.length === 0 && migration) {
      const p = proposal.data;
      const found = p.sites ? await findSites({ mirror: mirrorOf(j), match: p.sites.match, max: SITES_MAX }) : null;
      if (!p.sites) problems = [{ kind: "missing_sites", id: "sites" }];
      else if (!found) problems = [{ kind: "bad_sites", id: "match" }];
      else if (found.length > SITES_MAX) problems = [{ kind: "too_many_sites", id: String(SITES_MAX) }];
      else {
        problems = validateSites(found, p.units, p.skip ?? []);
        sites = siteTable(found, p.units, p.skip ?? []);
      }
    }
    if (problems.length === 0) units = proposal.data.units;
  }
  if (!units) {
    await inTransaction(d.db, (tx) => tx.query("update public.jobs set plan_rounds = $2, problems = $3::jsonb where id = $1", [j.id, rounds, JSON.stringify(problems.slice(0, 100))]));
    await park(d.db, j, `The planner did not make a valid plan in ${rounds} round(s). Problems: ${problems.map((p) => `${p.kind} ${p.id}`).join(", ").slice(0, 1500) || "no answer"}.`, { why: "plan_invalid", rounds, problems: problems.length });
    return "parked";
  }
  const plan = units;
  const branch = await startJobBranch({ mirror: mirrorOf(j), ref: jobBranch(j.id) });
  const planHash = hashJcs(plan);
  // D-545: large work (the profile's plan says pilot) starts with a pilot of its first units
  const pilot = new Set(axes.success && deriveProfile(axes.data).plan.pilot ? pilotUnits(plan, pilotSize(plan.length)) : []);
  await inTransaction(d.db, async (tx) => {
    for (const [n, u] of plan.entries()) {
      await tx.query("insert into public.job_units (job_id, unit_id, org_id, ord, title, criteria, depends_on, pilot, files) values ($1, $2, $3::uuid, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb)", [j.id, u.id, j.org_id, n, u.title, JSON.stringify(u.criteria), JSON.stringify(u.depends_on), pilot.has(u.id), JSON.stringify(u.files ?? [])]);
    }
    await tx.query("update public.jobs set status = 'running', mode = $6, pilot_state = $7, sites = $8::jsonb, plan_hash = $2, plan_rounds = $3, problems = '[]'::jsonb, base_sha = $4, head_sha = $5, updated_at = now() where id = $1", [j.id, planHash, rounds, branch.base, branch.head, mode, pilot.size > 0 ? "running" : "none", sites ? JSON.stringify(sites) : null]);
    // hashes and counts only: no criterion text, no titles
    const waves = Math.max(0, ...Object.values(unitWaves(plan))) + 1;
    await appendLedgerOnline(tx, { org_id: j.org_id, kind: "plan_built", task_id: null, payload: { job: j.id, spec_hash: j.spec_hash, oracle_hash: j.oracle_hash, plan_hash: planHash, units: plan.length, rounds, mode, waves, pilot: pilot.size, sites: sites?.length ?? 0 } });
  });
  return "planned";
}

export async function advanceJob(d: JobDeps, j: JobRow): Promise<"started" | "waiting" | "parked" | "final"> {
  const spec = await specOf(d.db, j);
  if (!spec) {
    await park(d.db, j, "The approved spec of this job changed or is gone.", { why: "spec_missing" });
    return "parked";
  }
  const mode: JobMode = j.mode === "waves" ? "waves" : "single";
  const rows = (await d.db.query<UnitRow>(`select ${UNIT_COLS} from public.job_units where job_id = $1 order by ord`, [j.id])).rows;
  // the units with a task first: still working, built again, rescued, or waiting for a person (job-unit.ts)
  const units: UnitRow[] = [];
  for (const u of rows) units.push(await settleUnit(d, j, spec, mode, u, rows));
  if (units.every((u) => u.status === "passed")) {
    const id = taskIdOf(j.id, `f${j.converge_round}`);
    await insertTask(d.db, j, { id, text: `Final check of job ${j.id}: the whole change against the full oracle.`, unit: null, role: "final" });
    await d.db.query("update public.jobs set status = 'converging', final_task_id = $2, updated_at = now() where id = $1", [j.id, id]);
    return "final";
  }
  // D-545: the pilot passed → its lessons become the playbook of the rest, then the rest may start
  if (j.pilot_state === "running" && units.filter((u) => u.pilot).every((u) => u.status === "passed")) await tunePilot(d, j, spec, units);
  const start = unitsToStart(units, mode, JOB_PARALLEL_MAX, { pilotOnly: j.pilot_state === "running" });
  for (const unitId of start) {
    const next = units.find((u) => u.unit_id === unitId);
    if (!next) continue;
    // a new task = a fresh agent context; it gets the spec, its unit and the earlier units' handoffs (the progress)
    const id = taskIdOf(j.id, next.relands > 0 ? `${next.ord}r${next.relands}` : String(next.ord));
    const text = withFiles(unitTaskText(spec, { id: next.unit_id, title: next.title, criteria: next.criteria }, doneBefore(units, next.ord)), next.files);
    await insertTask(d.db, j, { id, text: next.pilot ? text : withPlaybook(text, j.playbook), unit: next.unit_id, role: "unit" });
    await d.db.query("update public.job_units set status = 'running', task_id = $3, tries = '[]'::jsonb, updated_at = now() where job_id = $1 and unit_id = $2", [j.id, next.unit_id, id]);
  }
  // a rescue started its fresh tries this tick
  if (start.length > 0 || units.some((u, k) => u.rescues > (rows[k]?.rescues ?? 0))) return "started";
  // D-542: the job parks only when nothing works any more and a unit waits for a person
  const live = units.some((u) => u.task_id !== null && u.status !== "passed" && u.status !== "parked");
  const parked = units.filter((u) => u.status === "parked");
  if (live || parked.length === 0) return "waiting";
  await park(d.db, j, parked.map((u) => u.question ?? `Unit ${u.unit_id} waits for you.`).join(" ").slice(0, 2000), { why: "unit_stopped", units: parked.map((u) => u.unit_id) });
  return "parked";
}

/** the stored site table (D-546), only well-formed rows */
const sitesOf = (raw: unknown): { file: string; category: string }[] =>
  Array.isArray(raw) ? raw.filter((x): x is { file: string; category: string } => x !== null && typeof x === "object" && typeof (x as { file?: unknown }).file === "string" && typeof (x as { category?: unknown }).category === "string") : [];

export async function convergeJob(d: JobDeps, j: JobRow): Promise<"waiting" | "sealed" | "more" | "parked"> {
  if (!j.final_task_id) return "waiting";
  const task = (await d.db.query<{ state: string; wait_reason: string | null }>("select state, wait_reason from public.tasks where id = $1", [j.final_task_id])).rows[0];
  if (!task || !["CLOSED", "BLOCKED", "HELD"].includes(task.state)) return "waiting";
  const v = (await d.db.query<{ id: string; result: VerdictResult; reasons: string[] }>("select id::text as id, result, reasons from public.verdicts where task_id = $1 order by created_at desc limit 1", [j.final_task_id])).rows[0];
  const spec = await specOf(d.db, j);
  if (!v || !spec) {
    await park(d.db, j, `The final check of the job did not finish (${task.wait_reason ?? task.state}).`, { why: "final_not_run" });
    return "parked";
  }
  const evidence = (await d.db.query<{ detector: string; status: "pass" | "fail" | "unknown" | "n/a"; data: unknown }>("select detector, status, data from public.evidence where verdict_id = $1::uuid order by id", [v.id])).rows;
  if (v.result === "VERIFIED" && j.head_sha) {
    const head = (await d.db.query<{ hash: string }>("select hash from public.ledger where org_id = $1::uuid order by seq desc limit 1", [j.org_id])).rows[0]?.hash ?? null;
    const seal = sealFor({ spec, specHash: j.spec_hash as Sha256, oracleHash: j.oracle_hash as Sha256, verdict: "VERIFIED", head: j.head_sha, evidence, ledgerHead: (head as Sha256 | null), sites: sitesOf(j.sites) });
    const sealHash = hashJcs(seal);
    await inTransaction(d.db, async (tx) => {
      await tx.query("update public.jobs set status = 'sealed', seal = $2::jsonb, seal_hash = $3, updated_at = now() where id = $1", [j.id, JSON.stringify(seal), sealHash]);
      await appendLedgerOnline(tx, { org_id: j.org_id, kind: "session_sealed", task_id: null, payload: { job: j.id, seal_hash: sealHash, spec_hash: seal.spec_hash, oracle_hash: seal.oracle_hash, verdict: seal.verdict, result_ref: seal.result_ref, unchecked: seal.unchecked.length } });
    });
    return "sealed";
  }
  const red = failingCriteria(evidence);
  if (v.result === "FAILED" && red.length > 0 && j.converge_round < CONVERGE_ROUNDS) {
    // new units for exactly the criteria still red; the next final check sees them all again
    const round = j.converge_round + 1;
    const ord = ((await d.db.query<{ n: number | null }>("select max(ord) as n from public.job_units where job_id = $1", [j.id])).rows[0]?.n ?? -1) + 1;
    await inTransaction(d.db, async (tx) => {
      await tx.query("insert into public.job_units (job_id, unit_id, org_id, ord, title, criteria, depends_on, round) values ($1, $2, $3::uuid, $4, $5, $6::jsonb, '[]'::jsonb, $7)", [j.id, `fix-${round}`, j.org_id, ord, `Make ${red.join(", ")} pass`, JSON.stringify(red), round]);
      await tx.query("update public.jobs set status = 'running', converge_round = $2, final_task_id = null, updated_at = now() where id = $1", [j.id, round]);
    });
    return "more";
  }
  const why = red.length > 0 ? `criteria still failing after ${j.converge_round} extra round(s): ${red.join(", ")}` : `the result was ${v.result} (${v.reasons.slice(0, 5).join(", ") || "no reason"})`;
  await park(d.db, j, `The final check of the whole job did not pass: ${why}.`, { why: "final_failed", result: v.result, failing: red });
  return "parked";
}

/** approved by a person (web): the job branch head goes into main by the local delivery, fast-forward only */
export async function mergeJob(d: JobDeps, j: JobRow): Promise<"merged" | "parked"> {
  const seal = j.seal as { result_ref?: unknown } | null;
  const sha = typeof seal?.result_ref === "string" ? seal.result_ref : null;
  if (j.provider !== "local" || !sha) {
    await park(d.db, j, "Only a project on this computer can take a job's branch into main for now.", { why: "not_local" });
    return "parked";
  }
  const m = await mergeLocal({ mirror: mirrorOf(j), sha });
  if (!m.ok) {
    await park(d.db, j, `The job's branch could not go into main (${m.reason}); main may have moved since the job started.`, { why: "merge_failed", reason: m.reason });
    return "parked";
  }
  await inTransaction(d.db, async (tx) => {
    await tx.query("update public.jobs set status = 'delivered', merged_sha = $2, updated_at = now() where id = $1 and status = 'approved'", [j.id, m.to]);
    await appendLedgerOnline(tx, { org_id: j.org_id, kind: "delivered", task_id: null, payload: { job: j.id, merge_sha: m.to, from: m.from, seal_hash: j.seal_hash } });
  });
  return "merged";
}

export async function jobTick(d: JobDeps): Promise<JobTick> {
  const out: JobTick = { planned: [], started: [], parked: [], sealed: [], merged: [] };
  const jobs = (await d.db.query<JobRow>(`select ${JOB_COLS} from public.jobs j join public.repos r on r.id = j.repo_id where j.status in ('planning', 'running', 'converging', 'approved') order by j.created_at limit 50`)).rows;
  for (const j of jobs) {
    if (RUNNING.has(j.id)) continue;
    RUNNING.add(j.id);
    try {
      const r = j.status === "planning" ? await planJob(d, j) : j.status === "running" ? await advanceJob(d, j) : j.status === "converging" ? await convergeJob(d, j) : await mergeJob(d, j);
      if (r === "planned") out.planned.push(j.id);
      else if (r === "started" || r === "final" || r === "more") out.started.push(j.id);
      else if (r === "parked") out.parked.push(j.id);
      else if (r === "sealed") out.sealed.push(j.id);
      else if (r === "merged") out.merged.push(j.id);
    } catch (e) {
      d.log?.(`[job] ${j.id}: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    } finally {
      RUNNING.delete(j.id);
    }
  }
  return out;
}
