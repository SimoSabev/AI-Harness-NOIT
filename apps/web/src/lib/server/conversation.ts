import { randomBytes } from "node:crypto";
import { CHAT_BUDGET_USD, CHAT_MINUTES, CHAT_TEXT_MAX, ChatApproveBody, ChatMessageBody, ChatRetryBody, ChatTurn, OracleApproveBody, OracleManifest, OracleProblem, OracleStatus, PROFILES_NEED_TESTS, Spec, TaskAxes, briefText, jcs, oracleHash, oracleTaskText, sha256Tag, specHash, specText } from "@mandat/contract";
import { deriveProfile } from "@mandat/core";
import type { Brief } from "@mandat/contract";
import { canAct, createTask } from "./actions";
import { hasCap } from "./roles";
import type { Result } from "./actions";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";
import { taskTypeFor } from "../agents";
import type { ConversationFeed, ConversationRow, OracleView } from "../conversation-types";
import { createJob, jobView } from "./job";

export type { ConversationFeed, ConversationRow, OracleView };

// D-531 (E10a phase 1): the conversation before work, from the web. A person who may start tasks writes; the server stores
// the turn and queues the conversation (the worker answers, without a sandbox). "Start work" makes today's task from the
// conversation through createTask — the same path as the task box, no second logic — and only a person can press it.
// D-533: only a person approves a proposed spec (approve.level1, the owner and approver roles); the approval is a
// ledger row spec_approved with the hash (no spec text). "Start work" with an approved spec makes the task from the
// spec and carries its hash into the task (and so into the sealed contract); without one it works as in D-531.

const err = (status: number, error: string): Result => ({ status, body: { error } });
const TS = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const COLS = "c.id, c.agent, c.model, c.phase, c.status, c.usd::float8 as usd, c.budget_usd::float8 as budget_usd, c.error, c.task_id, c.profile, c.unknown_axes, c.spec_hash, c.spec_ready, c.approved_spec_hash, c.purpose, (c.purpose = 'project' and c.project_brief_hash is not null and exists (select 1 from public.repos r where r.id = c.repo_id and r.brief_hash = c.project_brief_hash and r.brief_approved_at is not null)) as project_approved";
/** a stop the person cannot send past: a new conversation starts instead */
const ENDED = ["budget", "expired"];

interface Owned { status: string; phase: string; org: string }
async function owned(db: Db, id: string, org: string): Promise<Owned | null> {
  return (await asService(db, (sql) => sql.query<Owned>("select status, phase, org_id::text as org from public.conversations where id = $1 and org_id = $2::uuid", [id, org]))).rows[0] ?? null;
}
async function nextSeq(db: Db, id: string): Promise<number> {
  return (await asService(db, (sql) => sql.query<{ n: number }>("select coalesce(max(seq), -1)::int + 1 as n from public.conversation_turns where conversation_id = $1", [id]))).rows[0]?.n ?? 0;
}

export async function sendMessage(db: Db, o: { uid: string; org: string; body: unknown }): Promise<Result> {
  if (!(await canAct(db, o.uid, o.org))) return err(403, "not_an_approver");
  const b = ChatMessageBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  const m = b.data;
  // D-557: a project interview is about one project
  if (m.purpose === "project" && !m.conversation && !m.repo) return err(400, "project_needs_repo");
  if (m.repo && (await asService(db, (sql) => sql.query("select 1 from public.repos where id = $1::uuid and org_id = $2::uuid", [m.repo, o.org]))).rows.length === 0) return err(404, "unknown_repo");
  let id = m.conversation;
  if (id) {
    const c = await owned(db, id, o.org);
    if (!c) return err(404, "unknown_conversation");
    if (c.phase !== "conversation") return err(409, "work_started");
    if (c.status === "queued" || c.status === "running") return err(409, "answering");
    if (ENDED.includes(c.status)) return err(409, c.status);
  } else {
    id = `c_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
    await asService(db, (sql) =>
      sql.query(
        "insert into public.conversations (id, org_id, repo_id, created_by, agent, model, budget_usd, expires_at, status, purpose) values ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, now() + make_interval(mins => $8), 'idle', $9)",
        [id, o.org, m.repo ?? null, o.uid, m.agent, m.model ?? null, CHAT_BUDGET_USD, CHAT_MINUTES, m.purpose ?? "task"],
      ),
    );
  }
  const seq = await nextSeq(db, id);
  const cid = id;
  await asService(db, async (sql) => {
    await sql.query("insert into public.conversation_turns (org_id, conversation_id, seq, kind, data) values ($1::uuid, $2, $3, 'human', $4::jsonb)", [o.org, cid, seq, JSON.stringify({ text: m.text })]);
    await sql.query("update public.conversations set agent = $2, model = $3, status = 'queued', error = null, updated_at = now() where id = $1", [cid, m.agent, m.model ?? null]);
  });
  return { status: 201, body: { id: cid, seq } };
}

/** the same question again (after an overloaded provider or a failure), on the model the person picked */
export async function retryConversation(db: Db, o: { uid: string; org: string; id: string; body: unknown }): Promise<Result> {
  if (!(await canAct(db, o.uid, o.org))) return err(403, "not_an_approver");
  const b = ChatRetryBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  const c = await owned(db, o.id, o.org);
  if (!c) return err(404, "unknown_conversation");
  if (c.phase !== "conversation" || !["overloaded", "failed"].includes(c.status)) return err(409, "not_retryable");
  await asService(db, (sql) => sql.query("update public.conversations set agent = $2, model = $3, status = 'queued', error = null, updated_at = now() where id = $1", [o.id, b.data.agent, b.data.model ?? null]));
  return { status: 200, body: { id: o.id } };
}

/** the text of today's task: the brief the model proposed (if any) and what the person wrote */
export function workText(turns: readonly ChatTurn[]): string {
  const brief = turns.findLast((t): t is Extract<ChatTurn, { kind: "assistant" }> & { brief: Brief } => t.kind === "assistant" && t.brief !== null)?.brief;
  const said = turns.flatMap((t) => (t.kind === "human" ? [t.text] : [])).join("\n\n");
  const head = brief ? `${briefText(brief)}\n\n` : "";
  return `${head}${said}`.slice(0, CHAT_TEXT_MAX);
}

/** D-533: a person approves the proposed spec of this hash; the model has no way here (a person's session, the cap) */
export async function approveSpec(db: Db, o: { uid: string; org: string; id: string; body: unknown }): Promise<Result> {
  const b = ChatApproveBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  const c = (await asService(db, (sql) => sql.query<{ phase: string; status: string; repo: string | null; spec: unknown; spec_hash: string | null; spec_ready: boolean; profile: string | null }>("select phase, status, repo_id::text as repo, spec, spec_hash, spec_ready, profile from public.conversations where id = $1 and org_id = $2::uuid", [o.id, o.org]))).rows[0];
  if (!c) return err(404, "unknown_conversation");
  if (!(await hasCap(db, o.uid, o.org, "approve.level1", { repo: c.repo }))) return err(403, "not_an_approver");
  if (c.phase !== "conversation") return err(409, "work_started");
  if (c.status === "queued" || c.status === "running") return err(409, "answering");
  const spec = Spec.safeParse(c.spec);
  // the stored hash must be the spec's own hash and the one the person saw
  if (!c.spec_ready || !spec.success || c.spec_hash !== specHash(spec.data)) return err(409, "spec_not_ready");
  if (b.data.spec_hash !== c.spec_hash) return err(409, "spec_changed");
  const hash = c.spec_hash;
  const done = await asService(db, async (sql) => {
    const u = await sql.query("update public.conversations set approved_spec = spec, approved_spec_hash = spec_hash, approved_by = $3::uuid, approved_at = now(), updated_at = now() where id = $1 and spec_hash = $2 and spec_ready and approved_spec_hash is distinct from $2 returning id", [o.id, hash, o.uid]);
    if (u.rows.length === 0) return false;
    const text = jcs({ conversation: o.id, spec_hash: hash, profile: c.profile, by: o.uid });
    await sql.query("select private.ledger_append($1::uuid, 'spec_approved', null, $2, $3)", [o.org, text, sha256Tag(text)]);
    return true;
  });
  if (!done) return err(409, "already_approved");
  return { status: 200, body: { id: o.id, spec_hash: hash } };
}

/** D-534: the spec needs an oracle when the plan of its profile (from the axes) has hidden tests */
export function oracleRequired(axes: unknown, spec: Spec): boolean {
  const a = TaskAxes.safeParse(axes);
  return a.success ? deriveProfile(a.data).plan.oracle.includes("hidden_tests") : PROFILES_NEED_TESTS.includes(spec.profile);
}
interface ApprovedRow { phase: string; status: string; agent: string; model: string | null; repo: string | null; axes: unknown; approved_spec: unknown; approved_spec_hash: string | null }
async function approvedOf(db: Db, id: string, org: string): Promise<{ row: ApprovedRow; spec: { spec: Spec; hash: string } | null } | null> {
  const row = (await asService(db, (sql) => sql.query<ApprovedRow>("select phase, status, agent, model, repo_id::text as repo, axes, approved_spec, approved_spec_hash from public.conversations where id = $1 and org_id = $2::uuid", [id, org]))).rows[0];
  if (!row) return null;
  // the approved spec counts only when its hash is checked again
  const a = Spec.safeParse(row.approved_spec);
  return { row, spec: a.success && row.approved_spec_hash === specHash(a.data) ? { spec: a.data, hash: row.approved_spec_hash } : null };
}
interface OracleDbRow { id: string; status: string; spec_hash: string; oracle_hash: string | null; manifest: unknown; problems: unknown; red_on_base: unknown }
const ORACLE_COLS = "id, status, spec_hash, oracle_hash, manifest, problems, red_on_base";
const LATEST_ORACLE = `select ${ORACLE_COLS} from public.oracles where conversation_id = $1 and spec_hash = $2 order by created_at desc, id desc limit 1`;
async function latestOracle(db: Db, id: string, hash: string): Promise<OracleDbRow | null> {
  return (await asService(db, (sql) => sql.query<OracleDbRow>(LATEST_ORACLE, [id, hash]))).rows[0] ?? null;
}

/** D-534: "Build oracle": a person starts a separate agent task that writes the hidden acceptance tests of the approved spec */
export async function buildOracle(db: Db, o: { uid: string; org: string; id: string }): Promise<Result> {
  if (!(await canAct(db, o.uid, o.org))) return err(403, "not_an_approver");
  const c = await approvedOf(db, o.id, o.org);
  if (!c) return err(404, "unknown_conversation");
  if (c.row.phase !== "conversation") return err(409, "work_started");
  if (!c.spec) return err(409, "spec_not_approved");
  if (!oracleRequired(c.row.axes, c.spec.spec)) return err(409, "oracle_not_needed");
  const last = await latestOracle(db, o.id, c.spec.hash);
  if (last?.status === "building") return err(409, "oracle_building");
  if (last?.status === "approved") return err(409, "oracle_approved");
  const hash = c.spec.hash;
  const r = await createTask(db, { uid: o.uid, org: o.org, kind: "oracle", specHash: hash, body: { type: taskTypeFor(c.row.agent), agent: c.row.agent, text: oracleTaskText(c.spec.spec), ...(c.row.model ? { model: c.row.model } : {}), ...(c.row.repo ? { repo: c.row.repo } : {}) } });
  if (r.status !== 201) return r;
  const oid = `o_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  await asService(db, (sql) => sql.query("insert into public.oracles (id, org_id, repo_id, conversation_id, spec_hash, task_id, created_by) select $1, $2::uuid, t.repo_id, $3, $4, t.id, $6::uuid from public.tasks t where t.id = $5", [oid, o.org, o.id, hash, r.body.id, o.uid]));
  return { status: 201, body: { id: oid, task_id: r.body.id, spec_hash: hash }, ...(r.broadcast ? { broadcast: r.broadcast } : {}) };
}

/** D-534: a person approves that the oracle covers the spec (the hash they saw); the ledger keeps hashes and counts */
export async function approveOracle(db: Db, o: { uid: string; org: string; id: string; body: unknown }): Promise<Result> {
  const b = OracleApproveBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  const c = await approvedOf(db, o.id, o.org);
  if (!c) return err(404, "unknown_conversation");
  if (!(await hasCap(db, o.uid, o.org, "approve.level1", { repo: c.row.repo }))) return err(403, "not_an_approver");
  if (c.row.phase !== "conversation") return err(409, "work_started");
  if (!c.spec) return err(409, "spec_not_approved");
  const spec = c.spec;
  const last = await latestOracle(db, o.id, spec.hash);
  if (last?.status === "approved") return err(409, "already_approved");
  const m = OracleManifest.safeParse(last?.manifest);
  // the stored hash must be the manifest's own hash (for this spec) and the one the person saw
  if (!last || last.status !== "ready" || !m.success || m.data.spec_hash !== spec.hash || last.oracle_hash !== oracleHash(m.data)) return err(409, "oracle_not_ready");
  if (b.data.oracle_hash !== last.oracle_hash) return err(409, "oracle_changed");
  const done = await asService(db, async (sql) => {
    const u = await sql.query("update public.oracles set status = 'approved', approved_by = $3::uuid, approved_at = now(), updated_at = now() where id = $1 and oracle_hash = $2 and status = 'ready' returning id", [last.id, last.oracle_hash, o.uid]);
    if (u.rows.length === 0) return false;
    const text = jcs({ conversation: o.id, oracle: last.id, oracle_hash: last.oracle_hash, spec_hash: spec.hash, tests: m.data.hidden_tests.length, criteria: m.data.red_on_base.length, by: o.uid });
    await sql.query("select private.ledger_append($1::uuid, 'oracle_approved', null, $2, $3)", [o.org, text, sha256Tag(text)]);
    return true;
  });
  if (!done) return err(409, "already_approved");
  return { status: 200, body: { id: o.id, oracle_hash: last.oracle_hash } };
}

/** "Start work": a person's action makes today's task from the conversation; the conversation's phase becomes work */
export async function startWork(db: Db, o: { uid: string; org: string; id: string }): Promise<Result> {
  if (!(await canAct(db, o.uid, o.org))) return err(403, "not_an_approver");
  const c0 = await approvedOf(db, o.id, o.org);
  if (!c0) return err(404, "unknown_conversation");
  const c = c0.row;
  if (c.phase !== "conversation") return err(409, "work_started");
  // D-533: an approved spec (its hash checked again) is the task; without one the brief and the person's words (D-531)
  const spec = c0.spec;
  // D-534: a spec whose plan has hidden tests needs an approved oracle; its hash goes into the task next to spec_hash
  let oracle: string | null = null;
  if (spec && oracleRequired(c.axes, spec.spec)) {
    const last = await latestOracle(db, o.id, spec.hash);
    if (last?.status !== "approved" || !last.oracle_hash) return err(409, "oracle_not_approved");
    oracle = last.oracle_hash;
  }
  // D-535: an approved spec with an approved oracle is a job: planned, built unit by unit, verified and sealed
  if (spec && oracle) return createJob(db, { uid: o.uid, org: o.org, conversation: o.id, specHash: spec.hash, oracleHash: oracle, type: taskTypeFor(c.agent), agent: c.agent, model: c.model });
  const text = spec ? specText(spec.spec) : workText(await turnsOf(db, o.id));
  if (text.trim() === "") return err(409, "nothing_to_do");
  const r = await createTask(db, { uid: o.uid, org: o.org, body: { type: taskTypeFor(c.agent), agent: c.agent, text, ...(c.model ? { model: c.model } : {}), ...(c.repo ? { repo: c.repo } : {}) }, ...(spec ? { specHash: spec.hash } : {}), ...(oracle ? { oracleHash: oracle } : {}) });
  if (r.status !== 201) return r;
  await asService(db, (sql) => sql.query("update public.conversations set phase = 'work', task_id = $2, updated_at = now() where id = $1", [o.id, r.body.id]));
  return r;
}

async function turnsOf(db: Db, id: string, after = -1): Promise<ChatTurn[]> {
  return parseTurns((await asService(db, (sql) => sql.query<TurnRow>(TURNS, [id, after]))).rows);
}
type TurnRow = { seq: number; at: string; kind: string; data: Record<string, unknown> };
const TURNS = `select seq, ${TS("at")} as at, kind, data from public.conversation_turns where conversation_id = $1 and seq > $2 order by seq limit 400`;
const parseTurns = (rows: readonly TurnRow[]): ChatTurn[] =>
  rows.flatMap((r) => {
    const t = ChatTurn.safeParse({ ...r.data, seq: r.seq, at: r.at, kind: r.kind });
    return t.success ? [t.data] : [];
  });

/** the conversation and its turns after `after`, read as the person (RLS) */
export async function conversationFeed(db: Db, uid: string, org: string, id: string, after: number): Promise<ConversationFeed | null> {
  return asUser(db, uid, async (sql) => {
    const conversation = (await sql.query<ConversationRow>(`select ${COLS} from public.conversations c where c.id = $1 and c.org_id = $2::uuid`, [id, org])).rows[0];
    if (!conversation) return null;
    const turns = parseTurns((await sql.query<TurnRow>(TURNS, [id, after])).rows);
    // D-534: the oracle of the approved spec (its status, criterion ids and counts; never the tests)
    const a = (await sql.query<{ axes: unknown; approved_spec: unknown }>("select axes, approved_spec from public.conversations where id = $1", [id])).rows[0];
    const spec = Spec.safeParse(a?.approved_spec);
    if (!spec.success || conversation.approved_spec_hash === null) return { conversation, turns };
    const o = (await sql.query<OracleDbRow>(LATEST_ORACLE, [id, conversation.approved_spec_hash])).rows[0];
    const job = await jobView(sql, id, spec.data);
    return { conversation, turns, oracle_required: oracleRequired(a?.axes, spec.data), oracle: o ? oracleView(o) : null, ...(job ? { job } : {}) };
  });
}
function oracleView(o: OracleDbRow): OracleView {
  const m = OracleManifest.safeParse(o.manifest);
  const problems = Array.isArray(o.problems) ? o.problems.flatMap((p) => {
    const x = OracleProblem.safeParse(p);
    return x.success ? [x.data] : [];
  }) : [];
  const red = Array.isArray(o.red_on_base) ? (o.red_on_base as { criterion_id: unknown; red: unknown }[]).flatMap((x) => (typeof x.criterion_id === "string" && typeof x.red === "boolean" ? [{ criterion_id: x.criterion_id, red: x.red }] : [])) : [];
  return { id: o.id, status: OracleStatus.catch("failed").parse(o.status), spec_hash: o.spec_hash, oracle_hash: o.oracle_hash, problems, red_on_base: red, tests: m.success ? m.data.hidden_tests.length : 0 };
}
