import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Handoff, Spec, hashJcs, jobBranch, jobMapFiles, parseHandoff } from "@mandat/contract";
import type { Verdict } from "@mandat/contract";
import { failingCriteria, scopedOracleFiles, unitLands } from "@mandat/core";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import type { HiddenTests } from "@mandat/verify";
import type { RunTaskOutput } from "../run.js";
import { inTransaction } from "./db.js";
import type { Db } from "./db.js";
import { advanceJobBranch, jobChangeFiles, jobHead } from "./job-branch.js";
import { oracleTestsFor } from "./oracle.js";

// D-535: the daemon's side of a job's tasks. A unit runs on the job branch's head with only the oracle files of the
// criteria done so far (plus the unchanged ones) in tree B; a VERIFIED unit moves the branch by itself (no person per
// unit). The final task applies the whole job onto its base in place of an agent and is judged by the full oracle and
// D11.oracle. Nothing of a job goes to main here.

export interface JobTaskRef { id: string; org_id: string; repo_id: string; attempt: number; job_id: string; unit_id: string | null; job_role: "unit" | "final" }
interface JobRow { id: string; spec_hash: string; oracle_hash: string; base_sha: string | null; head_sha: string | null; mode: string }

export type JobInputs =
  | { ok: true; baseSha: string; hidden: HiddenTests | null; applyFiles: { path: string; data: Buffer | null }[] | null; grade: boolean; specHash: string; oracleHash: string; jobFiles: { path: string; data: Buffer }[] | null }
  | { ok: false; reason: "job_missing" | "job_branch_missing" | "oracle_unapproved" | "oracle_tampered" };

export async function jobInputs(db: Db, t: JobTaskRef, o: { mirror: string }): Promise<JobInputs> {
  const job = (await db.query<JobRow>("select id, spec_hash, oracle_hash, base_sha, head_sha, mode from public.jobs where id = $1", [t.job_id])).rows[0];
  if (!job || !job.base_sha) return { ok: false, reason: "job_missing" };
  const ot = await oracleTestsFor(db, { repo: t.repo_id, specHash: job.spec_hash, oracleHash: job.oracle_hash });
  if (!ot.ok) return { ok: false, reason: ot.reason };
  const head = await jobHead({ mirror: o.mirror, ref: jobBranch(job.id) });
  if (!head) return { ok: false, reason: "job_branch_missing" };
  const common = { specHash: job.spec_hash, oracleHash: job.oracle_hash };
  if (t.job_role === "final") {
    // the job's whole change over its base, verified as one change: every oracle file, and the mutation grade
    const applyFiles = await jobChangeFiles({ mirror: o.mirror, base: job.base_sha, head });
    return { ok: true, baseSha: job.base_sha, hidden: ot.hidden, applyFiles, grade: true, jobFiles: null, ...common };
  }
  const allowed = (await db.query<{ criteria: string[] }>("select criteria from public.job_units where job_id = $1 and (status = 'passed' or unit_id = $2)", [job.id, t.unit_id])).rows.flatMap((r) => r.criteria);
  // D-574: every file with a test of the unit's scope; D5 decides on the scope only (one big oracle file no longer waits)
  const files = scopedOracleFiles(ot.hidden.files, allowed);
  return { ok: true, baseSha: head, hidden: files.length > 0 ? { dir: ot.hidden.dir, files, scope: allowed } : null, applyFiles: null, grade: false, jobFiles: await mapOf(db, job, t.unit_id ?? ""), ...common };
}

/** D-543: the job's map and feature list for a unit's writer (read only in the sandbox; passes only from passed units) */
async function mapOf(db: Db, job: JobRow, unit: string): Promise<{ path: string; data: Buffer }[] | null> {
  const c = (await db.query<{ approved_spec: unknown }>("select c.approved_spec from public.jobs j join public.conversations c on c.id = j.conversation_id where j.id = $1", [job.id])).rows[0];
  const spec = Spec.safeParse(c?.approved_spec);
  if (!spec.success) return null;
  const units = (await db.query<{ unit_id: string; title: string; criteria: string[]; status: string; depends_on: string[]; handoff: unknown }>("select unit_id, title, criteria, status, depends_on, handoff from public.job_units where job_id = $1 order by ord", [job.id])).rows;
  const handoffs = units.filter((u) => u.status === "passed").flatMap((u) => {
    const h = Handoff.safeParse(u.handoff !== null && typeof u.handoff === "object" ? Object.fromEntries(Object.entries(u.handoff).filter(([k]) => k !== "commit")) : null);
    return h.success ? [h.data] : [];
  });
  const mode = job.mode === "waves" ? "waves" : "single";
  return jobMapFiles({ spec: spec.data, mode, units: units.map((u) => ({ id: u.unit_id, title: u.title, criteria: u.criteria, status: u.status, depends_on: u.depends_on })), current: unit, handoffs }).map((f) => ({ path: f.path, data: Buffer.from(f.data, "utf8") }));
}

const setTask = (tx: SqlClient, id: string, state: string, extra: { wait_reason: string | null; last_result: string | null; usd: number; minutes: number }) =>
  tx.query(
    "update public.tasks set state = $2, wait_reason = $3, last_result = $4, usd = $5, minutes = $6, outcome_decided = $7, state_entered_at = now(), state_deadline_at = null, updated_at = now(), seq = seq + 1 where id = $1",
    [id, state, extra.wait_reason, extra.last_result, extra.usd, extra.minutes, state === "CLOSED"],
  );

/** the verdict of a job's task: its rows (no changeset: nothing is delivered per unit), the unit's state, the branch */
export async function finishJobTask(db: Db, t: JobTaskRef, o: { mirror: string; verdict: Verdict; out: RunTaskOutput; diffPatch: Buffer; minutes: number; message: string }): Promise<{ state: string; wait_reason: string | null }> {
  const v = o.verdict;
  const usd = v.usage.usd;
  const job = (await db.query<JobRow>("select id, spec_hash, oracle_hash, base_sha, head_sha, mode from public.jobs where id = $1", [t.job_id])).rows[0];
  let state = "CLOSED";
  let wait: string | null = null;
  let commit: string | null = null;
  // D-542: in a rescue several tries build the same unit; once one has landed, the others do not land again
  const unit = t.job_role === "unit" ? (await db.query<{ status: string; failing: string[]; tries: string[] }>("select status, failing, tries from public.job_units where job_id = $1 and unit_id = $2", [t.job_id, t.unit_id])).rows[0] : undefined;
  const won = unit?.status === "passed";
  if (t.job_role === "unit" && won) [state, wait] = ["CLOSED", "another_try_won"];
  else if (t.job_role === "unit") {
    if (unitLands(v.result, v.reasons) && o.diffPatch.length > 0 && job) {
      const head = await jobHead({ mirror: o.mirror, ref: jobBranch(job.id) });
      // D-541: in waves another unit may have landed meanwhile; the patch goes onto the new head with a 3-way apply
      // (the final check verifies the whole branch). A conflict blocks the unit and the job builds it again.
      const moved = head !== null && head !== v.base_sha;
      const adv = head && (!moved || job.mode === "waves") ? await advanceJobBranch({ mirror: o.mirror, ref: jobBranch(job.id), head, patch: o.diffPatch, message: o.message, threeWay: moved }) : ({ ok: false, reason: "moved" } as const);
      if (adv.ok) commit = adv.sha;
      else [state, wait] = ["BLOCKED", `job_branch_${adv.reason}`];
    } else if (v.result === "FAILED") [state, wait] = ["BLOCKED", "failed"];
    else [state, wait] = ["BLOCKED", "unit_unknown"];
  }
  const notesFile = o.out.runDir ? path.join(o.out.runDir, "notes.txt") : null;
  const handoff = t.unit_id && commit && notesFile && existsSync(notesFile) ? parseHandoff(readFileSync(notesFile, "utf8"), t.unit_id) : null;
  const failing = failingCriteria(v.evidence);
  await inTransaction(db, async (tx) => {
    const vr = await tx.query<{ id: string }>(
      "insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, reasons, base_sha, tree_sha, verdict_hash) select $1::uuid, $2, $3, $4, 'full', t.agent, $5, $6::jsonb, $7, $8, $9 from public.tasks t where t.id = $2 returning id::text as id",
      [t.org_id, t.id, v.run_id, t.attempt, v.result, JSON.stringify(v.reasons), v.base_sha, v.tree_sha, hashJcs(v)],
    );
    for (const e of v.evidence) {
      await tx.query("insert into public.evidence (org_id, verdict_id, detector, phase, status, summary, data, source, signature) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8, $9)", [t.org_id, vr.rows[0]?.id, e.detector, e.phase, e.status, e.summary, JSON.stringify(e.data), e.source, e.signature ?? null]);
    }
    await appendLedgerOnline(tx, { org_id: t.org_id, kind: "verdict", task_id: t.id, payload: { run_id: v.run_id, result: v.result, reasons: v.reasons, verdict_hash: hashJcs(v), job: t.job_id, ...(t.unit_id ? { unit: t.unit_id } : { final: true }) } });
    if (t.job_role === "unit" && !won) {
      const status = commit ? "passed" : v.result === "FAILED" ? "failed" : "blocked";
      // among tries at once, the unit keeps the one that failed the fewest criteria (the oracle picks the best try)
      const keep = !commit && (unit?.tries.length ?? 0) > 1 && (unit?.failing.length ?? 0) > 0 && failing.length > (unit?.failing.length ?? 0);
      await tx.query(
        "update public.job_units set status = $3, result = $4, reasons = $5::jsonb, failing = $6::jsonb, commit_sha = coalesce($7, commit_sha), handoff = coalesce($8::jsonb, handoff), updated_at = now() where job_id = $1 and unit_id = $2 and status <> 'passed'",
        [t.job_id, t.unit_id, status, v.result, JSON.stringify(v.reasons.slice(0, 50)), JSON.stringify(keep ? unit?.failing ?? [] : failing), commit, handoff ? JSON.stringify({ ...handoff, commit }) : null],
      );
      if (commit) await tx.query("update public.jobs set head_sha = $2, updated_at = now() where id = $1", [t.job_id, commit]);
    }
    // D-708: the final check exported the whole job over its base; the card shows it before "Approve and merge"
    // (only the non-redacted patch reaches here, as for changeset_diffs; over 1 MB only its size)
    // D-713: a retried final check that exported nothing leaves no older attempt's change behind under its task
    if (t.job_role === "final" && o.diffPatch.length === 0) await tx.query("delete from public.job_diffs where task_id = $1", [t.id]);
    if (t.job_role === "final" && o.diffPatch.length > 0) {
      const big = o.diffPatch.length > 1048576;
      await tx.query("insert into public.job_diffs (task_id, job_id, org_id, diff, omitted_bytes, diff_hash) values ($1, $2, $3::uuid, $4, $5, $6) on conflict (task_id) do update set diff = excluded.diff, omitted_bytes = excluded.omitted_bytes, diff_hash = excluded.diff_hash", [t.id, t.job_id, t.org_id, big ? "" : o.diffPatch.toString("utf8"), big ? o.diffPatch.length : null, v.diff_hash]);
    }
    await setTask(tx, t.id, state, { wait_reason: wait, last_result: v.result, usd, minutes: o.minutes });
  });
  return { state, wait_reason: wait };
}
