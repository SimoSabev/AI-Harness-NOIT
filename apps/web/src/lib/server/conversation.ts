import { randomBytes } from "node:crypto";
import { CHAT_BUDGET_USD, CHAT_MINUTES, CHAT_TEXT_MAX, ChatApproveBody, ChatMessageBody, ChatRetryBody, ChatTurn, Spec, briefText, jcs, sha256Tag, specHash, specText } from "@mandat/contract";
import type { Brief } from "@mandat/contract";
import { canAct, createTask } from "./actions";
import { hasCap } from "./roles";
import type { Result } from "./actions";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";
import { taskTypeFor } from "../agents";
import type { ConversationFeed, ConversationRow } from "../conversation-types";

export type { ConversationFeed, ConversationRow };

// D-531 (E10a phase 1): the conversation before work, from the web. A person who may start tasks writes; the server stores
// the turn and queues the conversation (the worker answers, without a sandbox). "Start work" makes today's task from the
// conversation through createTask — the same path as the task box, no second logic — and only a person can press it.
// D-533: only a person approves a proposed spec (approve.level1, the owner and approver roles); the approval is a
// ledger row spec_approved with the hash (no spec text). "Start work" with an approved spec makes the task from the
// spec and carries its hash into the task (and so into the sealed contract); without one it works as in D-531.

const err = (status: number, error: string): Result => ({ status, body: { error } });
const TS = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const COLS = "c.id, c.agent, c.model, c.phase, c.status, c.usd::float8 as usd, c.budget_usd::float8 as budget_usd, c.error, c.task_id, c.profile, c.unknown_axes, c.spec_hash, c.spec_ready, c.approved_spec_hash";
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
        "insert into public.conversations (id, org_id, repo_id, created_by, agent, model, budget_usd, expires_at, status) values ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, now() + make_interval(mins => $8), 'idle')",
        [id, o.org, m.repo ?? null, o.uid, m.agent, m.model ?? null, CHAT_BUDGET_USD, CHAT_MINUTES],
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

/** "Start work": a person's action makes today's task from the conversation; the conversation's phase becomes work */
export async function startWork(db: Db, o: { uid: string; org: string; id: string }): Promise<Result> {
  if (!(await canAct(db, o.uid, o.org))) return err(403, "not_an_approver");
  const c = (await asService(db, (sql) => sql.query<{ phase: string; agent: string; model: string | null; repo: string | null; approved_spec: unknown; approved_spec_hash: string | null }>("select phase, agent, model, repo_id::text as repo, approved_spec, approved_spec_hash from public.conversations where id = $1 and org_id = $2::uuid", [o.id, o.org]))).rows[0];
  if (!c) return err(404, "unknown_conversation");
  if (c.phase !== "conversation") return err(409, "work_started");
  // D-533: an approved spec (its hash checked again) is the task; without one the brief and the person's words (D-531)
  const approved = Spec.safeParse(c.approved_spec);
  const spec = approved.success && c.approved_spec_hash === specHash(approved.data) ? { spec: approved.data, hash: c.approved_spec_hash } : null;
  const text = spec ? specText(spec.spec) : workText(await turnsOf(db, o.id));
  if (text.trim() === "") return err(409, "nothing_to_do");
  const r = await createTask(db, { uid: o.uid, org: o.org, body: { type: taskTypeFor(c.agent), agent: c.agent, text, ...(c.model ? { model: c.model } : {}), ...(c.repo ? { repo: c.repo } : {}) }, ...(spec ? { specHash: spec.hash } : {}) });
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
    return { conversation, turns: parseTurns((await sql.query<TurnRow>(TURNS, [id, after])).rows) };
  });
}
