import { z } from "zod";
import { AgentRefString, ModelId } from "./connections.js";

// E10а ф. 1 (D-531): a conversation before work. The model answers and asks; it cannot change files, run commands or
// reach the network. It has exactly three tools: ask the person (≤ 3 questions), search the memory (read only) and
// propose a brief. A brief is only shown: work starts from a person's action ("Start work"), never from the model.

export const ConversationId = z.string().regex(/^c_[a-z0-9_]{1,40}$/);
export type ConversationId = z.infer<typeof ConversationId>;

/** the session is a conversation until a person starts the work; then the task takes over */
export const SessionPhase = z.enum(["conversation", "work"]);
export type SessionPhase = z.infer<typeof SessionPhase>;

/** idle = waiting for the person; queued/running = the worker answers; the rest are stops with a clear reason */
export const ConversationStatus = z.enum(["idle", "queued", "running", "budget", "expired", "overloaded", "failed"]);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const CHAT_MAX_QUESTIONS = 3;
/** the token of a conversation: its budget and how long it lives (e10a rule 4, like research) */
export const CHAT_BUDGET_USD = 0.5;
export const CHAT_MINUTES = 120;
export const CHAT_TEXT_MAX = 4000;

const Line = z.string().trim().min(1).max(300);
export const Brief = z
  .object({
    goal: z.string().trim().min(1).max(600),
    touches: z.array(Line).max(12),
    avoid: z.array(Line).max(12),
    done_when: z.array(Line).min(1).max(8),
  })
  .strict();
export type Brief = z.infer<typeof Brief>;

/** the brief as the text of a task (what "Start work" hands to today's task) */
export function briefText(b: Brief): string {
  const list = (xs: string[]) => (xs.length > 0 ? xs.join("; ") : "-");
  return [`Goal: ${b.goal}`, `Touches: ${list(b.touches)}`, `Do not touch: ${list(b.avoid)}`, `Done when: ${list(b.done_when)}`].join("\n");
}

export const CHAT_TOOLS = ["ask_user", "search_memory", "propose_brief"] as const;
export const ChatToolCall = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("ask_user"), questions: z.array(Line).min(1).max(CHAT_MAX_QUESTIONS) }).strict(),
  z.object({ tool: z.literal("search_memory"), query: z.string().trim().min(1).max(200) }).strict(),
  z.object({ tool: z.literal("propose_brief"), brief: Brief }).strict(),
]);
export type ChatToolCall = z.infer<typeof ChatToolCall>;

/** what the model answers with: one JSON object, the words for the person and at most one tool call */
export const ChatModelReply = z.object({ say: z.string().max(8000), call: ChatToolCall.nullable().default(null) }).strict();
export type ChatModelReply = z.infer<typeof ChatModelReply>;

/** a model that asks more than 3 questions keeps the first 3 (e10a rule 2) */
export function capQuestions(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const r = raw as { call?: unknown };
  const call = r.call as { tool?: unknown; questions?: unknown } | null | undefined;
  if (!call || call.tool !== "ask_user" || !Array.isArray(call.questions)) return raw;
  return { ...r, call: { ...call, questions: call.questions.filter((q): q is string => typeof q === "string").slice(0, CHAT_MAX_QUESTIONS) } };
}

const Instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/);
const head = { seq: z.number().int().min(0), at: Instant };
export const ChatTurn = z.discriminatedUnion("kind", [
  z.object({ ...head, kind: z.literal("human"), text: z.string().min(1).max(CHAT_TEXT_MAX) }).strict(),
  z
    .object({
      ...head,
      kind: z.literal("assistant"),
      text: z.string().max(8000),
      questions: z.array(Line).max(CHAT_MAX_QUESTIONS),
      brief: Brief.nullable(),
      model: z.string().max(140),
      usd: z.number().min(0),
    })
    .strict(),
  z.object({ ...head, kind: z.literal("memory"), query: z.string().max(200), hits: z.array(z.object({ id: z.string().max(40), text: z.string().max(600) }).strict()).max(8) }).strict(),
]);
export type ChatTurn = z.infer<typeof ChatTurn>;

/** POST /api/conversations: a new conversation, or the next message of one */
export const ChatMessageBody = z
  .object({
    conversation: ConversationId.optional(),
    text: z.string().trim().min(1).max(CHAT_TEXT_MAX),
    agent: AgentRefString,
    model: ModelId.optional(),
    repo: z.string().uuid().optional(),
  })
  .strict();
export type ChatMessageBody = z.infer<typeof ChatMessageBody>;

/** POST /api/conversations/:id/retry: the same question again, on another model when the provider was overloaded */
export const ChatRetryBody = z.object({ agent: AgentRefString, model: ModelId.optional() }).strict();
export type ChatRetryBody = z.infer<typeof ChatRetryBody>;
