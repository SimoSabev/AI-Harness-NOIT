import { z } from "zod";
import { AgentRefString, ModelId } from "./connections.js";
import { Sha256 } from "./schemas.js";
import { AXIS_NAMES, TaskAxes, TaskProfileId } from "./task-profile.js";
import { CriterionId, Spec } from "./task-spec.js";
import { ProjectBrief, ProjectBriefParts } from "./project-brief.js";

// E10а ф. 1 (D-531): a conversation before work. The model answers and asks; it cannot change files, run commands or
// reach the network. A brief or a spec is only shown: work starts from a person's action ("Start work"), never from
// the model. D-533 (М1 Х1–Х2): the interview has no cap on questions; the model reads the selected project's mirror
// (list_dir, read_file, grep — read only), proposes the six axes (the server derives the profile) and a spec with
// checkable criteria. Only a person approves a spec; the model has no tool for it.

export const ConversationId = z.string().regex(/^c_[a-z0-9_]{1,40}$/);
export type ConversationId = z.infer<typeof ConversationId>;

/** the session is a conversation until a person starts the work; then the task takes over */
export const SessionPhase = z.enum(["conversation", "work"]);
export type SessionPhase = z.infer<typeof SessionPhase>;

/** idle = waiting for the person; queued/running = the worker answers; the rest are stops with a clear reason */
export const ConversationStatus = z.enum(["idle", "queued", "running", "budget", "expired", "overloaded", "failed", "limit"]);

/** live test 24.11.2026: a spent subscription stops a conversation with its own status; the error keeps only when it
 * resets (never a word of the answer, rule 5) */
export function subscriptionLimitError(resetsAt: string | null): string {
  return resetsAt === null ? "subscription_limit" : `subscription_limit resets ${resetsAt}`;
}
/** when a limit stop resets, from the conversation's error; null for any other error */
export function limitResetsAt(error: string | null): string | null {
  const m = error === null ? null : /^subscription_limit resets (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)$/.exec(error);
  return m?.[1] ?? null;
}
export type ConversationStatus = z.infer<typeof ConversationStatus>;

/** a safety limit on one message, not a cap on the interview (D-533 supersedes the cut at 3 of e10a rule 2) */
export const CHAT_QUESTIONS_LIMIT = 50;
/** the token of a conversation: its budget and how long it lives (e10a rule 4, like research) */
export const CHAT_BUDGET_USD = 0.5;
export const CHAT_MINUTES = 120;
export const CHAT_TEXT_MAX = 4000;

const Line = z.string().trim().min(1).max(300);
/** D-600: the answers a question offers — 2 to 8 short options, one or several to pick; the person can always write their own */
export const QuestionChoices = z.object({ options: z.array(z.string().trim().min(1).max(120)).min(2).max(8), multi: z.boolean().default(false) }).strict();
export type QuestionChoices = z.infer<typeof QuestionChoices>;
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

/** the spec as the text of today's task (what "Start work" hands to createTask; the task text is ≤ 4000 chars) */
export function specText(s: Spec): string {
  const list = (xs: string[]) => (xs.length > 0 ? xs.join("; ") : "-");
  const head = [
    `Goal: ${s.goal}`,
    `Profile: ${s.profile}`,
    "Acceptance criteria:",
    ...s.criteria.map((c) => `${c.id}: WHEN ${c.when.trim()} THE SYSTEM SHALL ${c.shall.trim()} (proof: ${c.proof})`),
    `Unchanged: ${list(s.unchanged)}`,
    `Out of scope: ${list(s.out_of_scope)}`,
  ].join("\n");
  const room = CHAT_TEXT_MAX - head.length - 2;
  const product = s.product.trim();
  return (product !== "" && room > 20 ? `${head}\n\n${product.slice(0, room)}` : head).slice(0, CHAT_TEXT_MAX);
}

/** a path inside the selected project, as the model writes it; the server normalizes and confines it (repo-tools) */
const RepoPathArg = z.string().max(300);
export const CHAT_TOOLS = ["ask_user", "search_memory", "list_dir", "read_file", "grep", "propose_axes", "propose_spec", "propose_brief"] as const;
export const CHAT_REPO_TOOLS = ["list_dir", "read_file", "grep"] as const;
export const ChatToolCall = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("ask_user"), questions: z.array(Line).min(1).max(CHAT_QUESTIONS_LIMIT), /** D-600: per question, answers to pick (null: free text) */ choices: z.array(QuestionChoices.nullable()).max(CHAT_QUESTIONS_LIMIT).optional() }).strict(),
  z.object({ tool: z.literal("search_memory"), query: z.string().trim().min(1).max(200) }).strict(),
  z.object({ tool: z.literal("list_dir"), path: RepoPathArg.default("") }).strict(),
  z.object({ tool: z.literal("read_file"), path: RepoPathArg, from_line: z.number().int().min(1).max(1_000_000).optional(), to_line: z.number().int().min(1).max(1_000_000).optional() }).strict(),
  z.object({ tool: z.literal("grep"), pattern: z.string().min(2).max(200), path: RepoPathArg.optional(), ignore_case: z.boolean().optional() }).strict(),
  // the server validates the axes and the spec itself, so the model gets the problems back instead of a lost call
  z.object({ tool: z.literal("propose_axes"), axes: z.unknown(), hint: z.string().max(40).optional() }).strict(),
  z.object({ tool: z.literal("propose_spec"), spec: z.unknown() }).strict(),
  z.object({ tool: z.literal("propose_brief"), brief: Brief }).strict(),
  // D-557: the brief of the whole project (a project interview); the server checks it like the spec
  z.object({ tool: z.literal("propose_project"), brief: z.unknown() }).strict(),
]);
export type ChatToolCall = z.infer<typeof ChatToolCall>;

/** what the model answers with: one JSON object, the words for the person and at most one tool call */
export const ChatModelReply = z.object({
  say: z.string().max(8000),
  call: ChatToolCall.nullable().default(null),
  /** D-599: in a project interview, the parts of the brief the model just learned (the server checks them like a call) */
  note: z.unknown().optional(),
}).strict();
export type ChatModelReply = z.infer<typeof ChatModelReply>;

/** a model that asks more than the safety limit keeps the first CHAT_QUESTIONS_LIMIT (D-533) */
export function capQuestions(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const r = raw as { call?: unknown };
  const call = r.call as { tool?: unknown; questions?: unknown } | null | undefined;
  if (!call || call.tool !== "ask_user" || !Array.isArray(call.questions)) return raw;
  const choices = (call as { choices?: unknown }).choices;
  return { ...r, call: { ...call, questions: call.questions.filter((q): q is string => typeof q === "string").slice(0, CHAT_QUESTIONS_LIMIT), ...(Array.isArray(choices) ? { choices: choices.slice(0, CHAT_QUESTIONS_LIMIT) } : {}) } };
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
      questions: z.array(Line).max(CHAT_QUESTIONS_LIMIT),
      /** D-600: the answers each question offers (aligned with questions; null: free text) */
      choices: z.array(QuestionChoices.nullable()).max(CHAT_QUESTIONS_LIMIT).optional(),
      brief: Brief.nullable(),
      model: z.string().max(140),
      usd: z.number().min(0),
      /** D-533: the server could not read the model's answer even after a correction; its raw text is never shown */
      unreadable: z.literal(true).optional(),
    })
    .strict(),
  z.object({ ...head, kind: z.literal("memory"), query: z.string().max(200), hits: z.array(z.object({ id: z.string().max(40), text: z.string().max(600) }).strict()).max(8) }).strict(),
  // D-533: what a tool did — never what a file holds (the contents live only inside one answer)
  z.object({ ...head, kind: z.literal("tool"), tool: z.enum(["list_dir", "read_file", "grep", "propose_axes", "propose_spec", "propose_project", "ask_user", "propose_brief"]), target: z.string().max(300), ok: z.boolean(), note: z.string().max(300) }).strict(),
  z.object({ ...head, kind: z.literal("axes"), axes: TaskAxes, hint: TaskProfileId.nullable(), profile: TaskProfileId, unknown: z.array(z.enum(AXIS_NAMES)).max(AXIS_NAMES.length), /** D-552: a saved Other profile for these axes */ saved: z.string().trim().min(1).max(80).optional() }).strict(),
  // D-557: the project brief the model proposed, with its hash and what it still lacks
  z.object({ ...head, kind: z.literal("project"), brief: ProjectBrief, hash: Sha256, ready: z.boolean(), missing: z.array(z.string().max(40)).max(10) }).strict(),
  // D-599: a note of the interview — parts of the brief the model just learned, and where from (the screen writes them live)
  z.object({ ...head, kind: z.literal("project_note"), from: z.enum(["code", "person"]), parts: ProjectBriefParts }).strict(),
  z.object({ ...head, kind: z.literal("spec"), spec: Spec, hash: Sha256, ready: z.boolean(), unknown: z.array(z.enum(AXIS_NAMES)).max(AXIS_NAMES.length), untestable: z.array(CriterionId).max(200) }).strict(),
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
    /** D-557: a new conversation about the whole project (needs repo); default: a task */
    purpose: z.enum(["task", "project"]).optional(),
  })
  .strict();
export type ChatMessageBody = z.infer<typeof ChatMessageBody>;

/** POST /api/conversations/:id/retry: the same question again, on another model when the provider was overloaded */
export const ChatRetryBody = z.object({ agent: AgentRefString, model: ModelId.optional() }).strict();
export type ChatRetryBody = z.infer<typeof ChatRetryBody>;

/** POST /api/conversations/:id/approve: a person approves the spec with this hash (a stale hash is refused) */
export const ChatApproveBody = z.object({ spec_hash: Sha256 }).strict();
export type ChatApproveBody = z.infer<typeof ChatApproveBody>;
