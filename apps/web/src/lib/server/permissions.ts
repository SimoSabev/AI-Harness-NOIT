import { z } from "zod";
import { ProfileLayers, Subject, ToolPattern, jcs, profileHash, sha256Tag } from "@mandat/contract";
import type { ToolRule } from "@mandat/contract";
import { applyPermissions, opensDangerous } from "@mandat/profile";
import type { Decision, PermissionRow } from "@mandat/profile";
import type { Result, SecondFactor } from "./actions";
import { hasCap } from "./roles";
import { asService } from "./sql";
import type { Sql, Db } from "./sql";

// E8g (v5 p. 4.4, AC-8.1, D-352): the "ask" cards of a HELD tool_approval task and the editable permission matrix.
// tool_permissions is the source of layer C: every change that alters a repo's layer C is a new approved profile
// version (private.layer_c_version, which also refuses a dangerous opening without a fresh TOTP).
export const AskDecisionBody = z.object({ ask_id: z.string().uuid(), decision: z.enum(["once", "always", "deny"]), factor_id: z.string().max(100).optional(), code: z.string().regex(/^\d{6}$/).optional() }).strict();
export const PermissionBody = z.object({ subject: Subject, tool: ToolPattern, decision: z.enum(["allow", "ask", "deny"]), factor_id: z.string().max(100).optional(), code: z.string().regex(/^\d{6}$/).optional() }).strict();

const err = (status: number, error: string): Result => ({ status, body: { error } });
const pgCode = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined);

async function ledger(sql: Sql, org: string, kind: "tool_permission" | "task_stopped" | "task_retry", task: string | null, payload: Record<string, unknown>): Promise<void> {
  const text = jcs(payload);
  await sql.query("select private.ledger_append($1::uuid, $2, $3, $4, $5)", [org, kind, task, text, sha256Tag(text)]);
}

interface Approved { repo_id: string; layers: ProfileLayers }
async function approvedProfiles(sql: Sql, org: string, repo?: string): Promise<Approved[]> {
  const r = await sql.query<{ repo_id: string; layers: unknown }>(
    `select r.id::text as repo_id, h.layers from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved'
      where r.org_id = $1::uuid and ($2::uuid is null or r.id = $2::uuid) order by r.id`,
    [org, repo ?? null],
  );
  return r.rows.flatMap((x) => {
    const p = ProfileLayers.safeParse(x.layers);
    return p.success ? [{ repo_id: x.repo_id, layers: p.data }] : [];
  });
}

const decisionIn = (c: readonly ToolRule[], subject: string, tool: string): Decision | null => c.find((r) => r.subject === subject && r.tool === tool)?.decision ?? null;
const dangerous = (profiles: readonly Approved[], rows: readonly PermissionRow[]) => rows.some((row) => profiles.some((p) => opensDangerous(row.tool, decisionIn(p.layers.c, row.subject, row.tool), row.decision)));

/** Upserts the rows and writes a new layer C version for every repo whose layer C changes. Returns how many versions. */
async function applyRows(sql: Sql, o: { uid: string; org: string; profiles: readonly Approved[]; rows: readonly PermissionRow[]; mfaAt: Date | null; why: Record<string, unknown> }): Promise<number> {
  for (const r of o.rows) {
    await sql.query(
      "insert into public.tool_permissions (org_id, subject, tool, decision) values ($1::uuid, $2, $3, $4) on conflict (org_id, subject, tool) do update set decision = excluded.decision",
      [o.org, r.subject, r.tool, r.decision],
    );
  }
  let n = 0;
  for (const p of o.profiles) {
    const c = applyPermissions(p.layers.c, o.rows);
    if (jcs(c) === jcs(p.layers.c)) continue;
    const layers = { ...p.layers, c };
    await sql.query("select private.layer_c_version($1::uuid, $2::jsonb, $3, $4::uuid, $5::timestamptz, $6::jsonb)", [p.repo_id, JSON.stringify(layers), profileHash(layers), o.uid, o.mfaAt?.toISOString() ?? null, JSON.stringify(o.why)]);
    n++;
  }
  return n;
}

async function factor(o: { uid: string; code?: string | undefined; factor_id?: string | undefined; secondFactor: SecondFactor }): Promise<Date | Result> {
  if (!o.code) return err(403, "second_factor_required");
  const at = await o.secondFactor({ uid: o.uid, code: o.code, factorId: o.factor_id });
  return at ?? err(403, "second_factor_invalid");
}

export async function decideAsk(db: Db, o: { uid: string; taskId: string; body: z.infer<typeof AskDecisionBody>; secondFactor: SecondFactor }): Promise<Result> {
  const t = (await asService(db, (sql) => sql.query<{ org_id: string; repo_id: string; type: string; state: string; wait_reason: string | null; attempt: number }>("select org_id::text as org_id, repo_id::text as repo_id, type, state, wait_reason, attempt from public.tasks where id = $1", [o.taskId]))).rows[0];
  if (!t) return err(404, "unknown_task");
  if (!(await hasCap(db, o.uid, t.org_id, "approve.tool", { repo: t.repo_id, type: t.type }))) return err(403, "not_an_approver");
  const ask = (await asService(db, (sql) => sql.query<{ tool: string; status: string; attempt: number }>("select tool, status, attempt from public.tool_asks where id = $1::uuid and task_id = $2", [o.body.ask_id, o.taskId]))).rows[0];
  if (!ask) return err(404, "unknown_ask");
  if (ask.status !== "pending" || ask.attempt !== t.attempt || t.state !== "HELD" || t.wait_reason !== "tool_approval") return err(409, "already_decided");

  let rows: PermissionRow[] = [];
  let profiles: Approved[] = [];
  let mfaAt: Date | null = null;
  if (o.body.decision === "always") {
    profiles = await asService(db, (sql) => approvedProfiles(sql, t.org_id, t.repo_id));
    const subjects = [...new Set(profiles.flatMap((p) => p.layers.c.filter((r) => r.tool === ask.tool && r.decision === "ask").map((r) => r.subject)))];
    if (subjects.length === 0) return err(409, "rule_gone");
    rows = subjects.map((subject) => ({ subject, tool: ask.tool, decision: "allow" as const }));
    if (dangerous(profiles, rows)) {
      const f = await factor({ uid: o.uid, code: o.body.code, factor_id: o.body.factor_id, secondFactor: o.secondFactor });
      if (!(f instanceof Date)) return f;
      mfaAt = f;
    }
  }
  try {
    const out = await asService(db, async (sql) => {
      const decided = o.body.decision === "deny" ? "denied" : o.body.decision;
      await sql.query("update public.tool_asks set status = $2, grant_attempt = $3, decided_by = $4::uuid, decided_at = now() where id = $1::uuid", [o.body.ask_id, decided, decided === "denied" ? null : t.attempt + 1, o.uid]);
      if (o.body.decision === "deny") {
        await sql.query("update public.tool_asks set status = 'denied', decided_by = $3::uuid, decided_at = now() where task_id = $1 and attempt = $2 and status = 'pending'", [o.taskId, t.attempt, o.uid]);
        await sql.query("update public.tasks set state = 'CLOSED', wait_reason = 'tool_denied', state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [o.taskId]);
        await ledger(sql, t.org_id, "task_stopped", o.taskId, { reason: "tool_denied", tool: ask.tool, by: o.uid });
        return { state: "CLOSED" };
      }
      if (o.body.decision === "always") {
        const versions = await applyRows(sql, { uid: o.uid, org: t.org_id, profiles, rows, mfaAt, why: { task: o.taskId, tool: ask.tool } });
        await ledger(sql, t.org_id, "tool_permission", o.taskId, { rows, before: "ask", by: o.uid, versions });
      }
      const pending = (await sql.query<{ n: number }>("select count(*)::int as n from public.tool_asks where task_id = $1 and attempt = $2 and status = 'pending'", [o.taskId, t.attempt])).rows[0]?.n ?? 0;
      if (pending > 0) return { state: "HELD", pending };
      await sql.query("update public.tasks set state = 'CREATED', attempt = attempt + 1, wait_reason = null, last_result = null, effective_level = null, retry_reason = 'human', state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [o.taskId]);
      await ledger(sql, t.org_id, "task_retry", o.taskId, { attempt: t.attempt + 1, by: o.uid, reason: "tool_approval" });
      return { state: "CREATED", attempt: t.attempt + 1 };
    });
    return { status: 200, body: out, broadcast: { org: t.org_id, task: o.taskId } };
  } catch (e) {
    if (pgCode(e) === "42501") return err(403, "second_factor_rejected");
    throw e;
  }
}

export async function setPermission(db: Db, o: { uid: string; org: string; body: z.infer<typeof PermissionBody>; secondFactor: SecondFactor }): Promise<Result> {
  if (!(await hasCap(db, o.uid, o.org, "tools.manage"))) return err(403, "not_allowed");
  const row: PermissionRow = { subject: o.body.subject, tool: o.body.tool, decision: o.body.decision };
  const profiles = await asService(db, (sql) => approvedProfiles(sql, o.org));
  const before = (await asService(db, (sql) => sql.query<{ decision: Decision }>("select decision from public.tool_permissions where org_id = $1::uuid and subject = $2 and tool = $3", [o.org, row.subject, row.tool]))).rows[0]?.decision ?? null;
  let mfaAt: Date | null = null;
  if (dangerous(profiles, [row]) || (profiles.length === 0 && opensDangerous(row.tool, before, row.decision))) {
    const f = await factor({ uid: o.uid, code: o.body.code, factor_id: o.body.factor_id, secondFactor: o.secondFactor });
    if (!(f instanceof Date)) return f;
    mfaAt = f;
  }
  try {
    const versions = await asService(db, async (sql) => {
      const n = await applyRows(sql, { uid: o.uid, org: o.org, profiles, rows: [row], mfaAt, why: { matrix: true } });
      await ledger(sql, o.org, "tool_permission", null, { rows: [row], before, by: o.uid, versions: n });
      return n;
    });
    return { status: 200, body: { versions } };
  } catch (e) {
    const c = pgCode(e);
    if (c === "42501") return err(403, "second_factor_rejected");
    if (c === "55000") return err(409, "blocked_invisible_characters");
    throw e;
  }
}
