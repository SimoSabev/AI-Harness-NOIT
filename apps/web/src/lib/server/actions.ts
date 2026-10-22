import { randomBytes } from "node:crypto";
import { ACCOUNT_AGENT, AGENT_IDS } from "../agents";
import { z } from "zod";
import { jcs, sha256Tag } from "@mandat/contract";
import { asService, asUser } from "./sql";
import type { Db, Sql } from "./sql";

// Demo prompt §8.1: the POST actions. Role check with the user's identity (RLS + private.authorize), then ONE
// transaction as service_role. Approval = private.approve_changeset (CAS head_sha, partial unique index, trigger on
// method + freshness ≤ 2 min, ledger, outbox) — never separate client calls.

export const ApproveBody = z.object({
  head_sha: z.string().regex(/^[0-9a-f]{40}$/),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().max(500).optional(),
  client: z.enum(["web", "pwa", "cli"]),
  factor_id: z.string().max(100).optional(),
  code: z.string().regex(/^\d{6}$/).optional(),
}).strict();
export type ApproveBody = z.infer<typeof ApproveBody>;

export const CreateTaskBody = z.object({
  type: z.enum(["bugfix", "feature", "css", "docs"]),
  agent: z.union([z.enum(AGENT_IDS), z.string().regex(ACCOUNT_AGENT)]),
  text: z.string().min(1).max(4000),
}).strict();

export const FailureLabelBody = z.object({
  layer: z.enum(["agent", "verification", "infra", "policy"]),
  label: z.string().min(1).max(200),
}).strict();

export type Result = { status: number; body: Record<string, unknown>; broadcast?: { org: string; task: string } };
/** Returns when the user's fresh second factor was verified (null = not verified). */
export type SecondFactor = (o: { uid: string; code: string; factorId: string | undefined }) => Promise<Date | null>;

const err = (status: number, error: string): Result => ({ status, body: { error } });

async function canAct(db: Db, uid: string, org: string): Promise<boolean> {
  return asUser(db, uid, async (sql) => (await sql.query<{ ok: boolean }>("select private.authorize('approver', $1::uuid) as ok", [org])).rows[0]?.ok === true);
}

function pgCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

async function ledger(sql: Sql, org: string, kind: string, task: string, payload: Record<string, unknown>): Promise<void> {
  const text = jcs(payload); // the formula of packages/ledger appendLedgerOnline
  await sql.query("select private.ledger_append($1::uuid, $2, $3, $4, $5)", [org, kind, task, text, sha256Tag(text)]);
}

export async function approve(db: Db, o: { uid: string; changesetId: string; body: ApproveBody; secondFactor: SecondFactor }): Promise<Result> {
  const cs = (await asService(db, (sql) => sql.query<{ org_id: string; task_id: string; requires_second_factor: boolean }>("select org_id::text as org_id, task_id, requires_second_factor from public.changesets where id = $1::uuid", [o.changesetId]))).rows[0];
  if (!cs) return err(404, "unknown_changeset");
  if (!(await canAct(db, o.uid, cs.org_id))) return err(403, "not_an_approver");
  let method: "tap" | "totp" = "tap";
  let mfaAt: Date | null = null;
  if (cs.requires_second_factor && o.body.decision === "approved") {
    if (!o.body.code) return err(403, "second_factor_required");
    mfaAt = await o.secondFactor({ uid: o.uid, code: o.body.code, factorId: o.body.factor_id });
    if (!mfaAt) return err(403, "second_factor_invalid");
    method = "totp";
  }
  try {
    const id = await asService(db, async (sql) => {
      const r = await sql.query<{ id: string }>("select private.approve_changeset($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8::timestamptz)::text as id", [o.changesetId, o.body.head_sha, o.uid, o.body.decision, o.body.reason ?? null, o.body.client, method, mfaAt?.toISOString() ?? null]);
      // the card leaves "Waiting for you" in the same transaction: approved → the gate continues (column 3); rejected → closed
      await sql.query("update public.changesets set approval_needed = false where id = $1::uuid", [o.changesetId]);
      await sql.query(
        o.body.decision === "approved"
          ? "update public.tasks set state = 'GATED', wait_reason = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1"
          : "update public.tasks set state = 'CLOSED', wait_reason = 'rejected', outcome_decided = true, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1",
        [cs.task_id],
      );
      return r.rows[0]?.id ?? "";
    });
    return { status: 200, body: { approval_id: id, decision: o.body.decision, method }, broadcast: { org: cs.org_id, task: cs.task_id } };
  } catch (e) {
    const c = pgCode(e);
    if (c === "40001") return err(409, "head_sha_moved");
    if (c === "23505") return err(409, "already_approved");
    if (c === "42501") return err(403, "second_factor_rejected");
    throw e;
  }
}

async function taskOrg(db: Db, id: string): Promise<{ org_id: string; state: string; wait_reason: string | null; last_result: string | null; attempt: number; attempts_max: number } | null> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(id)) return null;
  return (await asService(db, (sql) => sql.query<{ org_id: string; state: string; wait_reason: string | null; last_result: string | null; attempt: number; attempts_max: number }>("select org_id::text as org_id, state, wait_reason, last_result, attempt, attempts_max from public.tasks where id = $1", [id]))).rows[0] ?? null;
}

export async function stopTask(db: Db, o: { uid: string; taskId: string }): Promise<Result> {
  const t = await taskOrg(db, o.taskId);
  if (!t) return err(404, "unknown_task");
  if (!(await canAct(db, o.uid, t.org_id))) return err(403, "not_an_approver");
  if (["DELIVERED", "OUTCOME", "CLOSED", "BLOCKED"].includes(t.state)) return err(409, "not_stoppable");
  await asService(db, async (sql) => {
    await sql.query("update public.tasks set state = 'BLOCKED', wait_reason = 'stopped', state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [o.taskId]);
    await ledger(sql, t.org_id, "task_stopped", o.taskId, { by: o.uid, reason: "stopped" });
  });
  return { status: 200, body: { state: "BLOCKED" }, broadcast: { org: t.org_id, task: o.taskId } };
}

export async function retryTask(db: Db, o: { uid: string; taskId: string }): Promise<Result> {
  const t = await taskOrg(db, o.taskId);
  if (!t) return err(404, "unknown_task");
  if (!(await canAct(db, o.uid, t.org_id))) return err(403, "not_an_approver");
  // D-293: also after a rejected key / no change / no channel (fix the key, then run again)
  const retryable = t.state === "BLOCKED" || (t.state === "HELD" && (t.last_result === "UNKNOWN" || ["key_rejected", "empty_change", "no_channel", "base_moved"].includes(t.wait_reason ?? "")));
  if (!retryable) return err(409, "not_retryable");
  if (t.attempt >= t.attempts_max) return err(409, "no_attempts_left");
  await asService(db, async (sql) => {
    await sql.query("update public.tasks set state = 'CREATED', attempt = attempt + 1, wait_reason = null, last_result = null, effective_level = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [o.taskId]);
    await ledger(sql, t.org_id, "task_retry", o.taskId, { attempt: t.attempt + 1, by: o.uid });
  });
  return { status: 200, body: { state: "CREATED", attempt: t.attempt + 1 }, broadcast: { org: t.org_id, task: o.taskId } };
}

export async function labelFailure(db: Db, o: { uid: string; verdictId: string; body: z.infer<typeof FailureLabelBody> }): Promise<Result> {
  const v = (await asService(db, (sql) => sql.query<{ org_id: string; task_id: string; result: string }>("select org_id::text as org_id, task_id, result from public.verdicts where id = $1::uuid", [o.verdictId]))).rows[0];
  if (!v) return err(404, "unknown_verdict");
  if (!(await canAct(db, o.uid, v.org_id))) return err(403, "not_an_approver");
  if (v.result !== "FAILED") return err(409, "not_a_failure");
  await asService(db, async (sql) => {
    await sql.query("insert into public.failure_labels (org_id, verdict_id, layer, label, by_user) values ($1::uuid, $2::uuid, $3, $4, $5::uuid)", [v.org_id, o.verdictId, o.body.layer, o.body.label, o.uid]);
    await ledger(sql, v.org_id, "failure_label", v.task_id, { layer: o.body.layer, verdict_id: o.verdictId });
  });
  return { status: 200, body: { layer: o.body.layer }, broadcast: { org: v.org_id, task: v.task_id } };
}

export async function createTask(db: Db, o: { uid: string; org: string; body: z.infer<typeof CreateTaskBody> }): Promise<Result> {
  if (!(await canAct(db, o.uid, o.org))) return err(403, "not_an_approver");
  const id = `t_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const ok = await asService(db, async (sql) => {
    const repo = (await sql.query<{ id: string }>("select r.id::text as id from public.repos r join public.task_types tt on tt.repo_id = r.id and tt.name = $2 where r.org_id = $1::uuid order by r.created_at limit 1", [o.org, o.body.type])).rows[0];
    if (!repo) return false;
    await sql.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, created_by) values ($1, $2::uuid, $3::uuid, $4, $5, $6, $7::uuid)", [id, o.org, repo.id, o.body.type, o.body.agent, o.body.text, o.uid]);
    return true;
  });
  if (!ok) return err(409, "no_repo_for_type");
  return { status: 201, body: { id, state: "CREATED" }, broadcast: { org: o.org, task: id } };
}

/** E8g (v5 p. 4.7 (3), AC-9.2, D-356): a new attempt with the last CI log in its contract, at most ci_rounds (layer G, 2) rounds. */
export async function fixCiTask(db: Db, o: { uid: string; taskId: string }): Promise<Result> {
  const t = (await asService(db, (sql) => sql.query<{ org_id: string; state: string; wait_reason: string | null; attempt: number; ci_rounds: number; cap: number | null }>(
    `select t.org_id::text as org_id, t.state, t.wait_reason, t.attempt, t.ci_rounds,
            (select (h.layers -> 'g' ->> 'ci_rounds')::int from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = t.repo_id) as cap
       from public.tasks t where t.id = $1`,
    [o.taskId],
  ))).rows[0];
  if (!t) return err(404, "unknown_task");
  if (!(await canAct(db, o.uid, t.org_id))) return err(403, "not_an_approver");
  if (t.state !== "HELD" || t.wait_reason !== "ci_failed") return err(409, "not_retryable");
  if (t.ci_rounds >= (t.cap ?? 2)) return err(409, "ci_rounds_exhausted");
  await asService(db, async (sql) => {
    await sql.query("update public.tasks set state = 'CREATED', attempt = attempt + 1, retry_reason = 'ci', wait_reason = null, last_result = null, effective_level = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [o.taskId]);
    await ledger(sql, t.org_id, "task_retry", o.taskId, { attempt: t.attempt + 1, by: o.uid, reason: "ci" });
  });
  return { status: 200, body: { state: "CREATED", attempt: t.attempt + 1 }, broadcast: { org: t.org_id, task: o.taskId } };
}

/** E8g (v5 p. 4.7 (4), D-356): the review comments an approver chose (pasted) → a new attempt with them in its contract. */
export async function applyComments(db: Db, o: { uid: string; taskId: string; text: string }): Promise<Result> {
  const text = o.text.trim();
  if (text.length === 0 || text.length > 500) return err(400, "bad_text");
  const t = (await asService(db, (sql) => sql.query<{ org_id: string; state: string; attempt: number }>("select org_id::text as org_id, state, attempt from public.tasks where id = $1", [o.taskId]))).rows[0];
  if (!t) return err(404, "unknown_task");
  if (!(await canAct(db, o.uid, t.org_id))) return err(403, "not_an_approver");
  if (!["HELD", "GATED", "BLOCKED"].includes(t.state)) return err(409, "not_retryable");
  await asService(db, async (sql) => {
    await sql.query("insert into public.task_activities (org_id, task_id, kind, text, by_user) values ($1::uuid, $2, 'review', $3, $4::uuid)", [t.org_id, o.taskId, text, o.uid]);
    await sql.query("update public.tasks set state = 'CREATED', attempt = attempt + 1, retry_reason = 'human', wait_reason = null, last_result = null, effective_level = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [o.taskId]);
    await ledger(sql, t.org_id, "task_retry", o.taskId, { attempt: t.attempt + 1, by: o.uid, reason: "review_comments" });
  });
  return { status: 200, body: { state: "CREATED", attempt: t.attempt + 1 }, broadcast: { org: t.org_id, task: o.taskId } };
}
