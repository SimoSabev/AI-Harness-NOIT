import { randomBytes } from "node:crypto";
import { CHAT_BUDGET_USD, CHAT_MINUTES, CHAT_TEXT_MAX, ChatMessageBody, ChatRetryBody, ChatTurn, briefText } from "@mandat/contract";
import type { Brief } from "@mandat/contract";
import { canAct, createTask } from "./actions";
import type { Result } from "./actions";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";
import { taskTypeFor } from "../agents";
import type { ConversationFeed, ConversationRow } from "../conversation-types";

export type { ConversationFeed, ConversationRow };

// D-531 (E10a phase 1): the conversation before work, from the web. A person who may start tasks writes; the server stores
// the turn and queues the conversation (the worker answers, without a sandbox). "Start work" makes today's task from the
// conversation through createTask — the same path as the task box, no second logic — and only a person can press it.

const err = (status: number, error: string): Result => ({ status, body: { error } });
const TS = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const COLS = "c.id, c.agent, c.model, c.phase, c.status, c.usd::float8 as usd, c.budget_usd::float8 as budget_usd, c.error, c.task_id";
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

/** "Start work": a person's action makes today's task from the conversation; the conversation's phase becomes work */
export async function startWork(db: Db, o: { uid: string; org: string; id: string }): Promise<Result> {
  if (!(await canAct(db, o.uid, o.org))) return err(403, "not_an_approver");
  const c = (await asService(db, (sql) => sql.query<{ phase: string; agent: string; model: string | null; repo: string | null }>("select phase, agent, model, repo_id::text as repo from public.conversations where id = $1 and org_id = $2::uuid", [o.id, o.org]))).rows[0];
  if (!c) return err(404, "unknown_conversation");
  if (c.phase !== "conversation") return err(409, "work_started");
  const text = workText(await turnsOf(db, o.id));
  if (text.trim() === "") return err(409, "nothing_to_do");
  const r = await createTask(db, { uid: o.uid, org: o.org, body: { type: taskTypeFor(c.agent), agent: c.agent, text, ...(c.model ? { model: c.model } : {}), ...(c.repo ? { repo: c.repo } : {}) } });
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
