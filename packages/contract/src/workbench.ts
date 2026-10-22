import { z } from "zod";
import { TaskId } from "./schemas.js";

// D-307: the records behind the workbench screens (agents, tool calls, MCP/skills/plugins, permissions, open windows,
// the night shift, research). The worker writes them (service role); the web reads them under RLS. Nothing here
// carries a key, a token or an LLM body: summaries are redacted and capped.
export const SessionId = z.string().regex(/^s_[a-z0-9_]{1,40}$/);
export const RelPath = z.string().min(1).max(256).refine((s) => !s.startsWith("/") && !s.split("/").includes(".."));

const SECRET = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|gh[ousr]_[A-Za-z0-9]{20,}|mdt_[A-Za-z0-9_-]{8,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|(?:token|key|secret|password)=\S+)/gi;
/** Secrets out, newlines folded, at most 300 characters. */
export function redactSummary(s: string): string {
  return s.replace(SECRET, "[скрито]").replace(/\s+/g, " ").trim().slice(0, 300);
}
export function localUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return (x.protocol === "http:" || x.protocol === "https:") && (x.hostname === "localhost" || x.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export const AgentRole = z.enum(["lead", "subagent", "judge", "research"]);
export const AgentState = z.enum(["running", "waiting", "done", "failed", "idle"]);
export const AgentSessionWrite = z
  .object({
    id: SessionId,
    task_id: TaskId.nullable(),
    parent_id: SessionId.nullable(),
    agent: z.string().min(1).max(64),
    model: z.string().min(1).max(64),
    account: z.string().max(64).nullable(),
    role: AgentRole,
    state: AgentState,
    step: z.string().max(120),
    context_pct: z.number().min(0).max(100).nullable(),
    usd: z.number().min(0).max(10_000),
    touching: z.array(RelPath).max(200).default([]),
  })
  .strict()
  .refine((s) => (s.role === "subagent") === (s.parent_id !== null), { message: "a subagent has a parent, a lead does not" });
export type AgentSessionWrite = z.infer<typeof AgentSessionWrite>;

export const ToolKind = z.enum(["mcp", "skill", "builtin", "bash", "mandat"]);
export const ToolDecision = z.enum(["allowed", "asked", "denied", "slow", "error"]);
export const ToolCallWrite = z
  .object({
    session_id: SessionId,
    kind: ToolKind,
    tool: z.string().min(1).max(120).regex(/^[A-Za-z0-9_.:\-/*]+$/),
    summary: z.string().max(4000).transform(redactSummary),
    decision: ToolDecision,
    duration_ms: z.number().int().min(0).max(86_400_000).nullable(),
  })
  .strict();
export type ToolCallWrite = z.infer<typeof ToolCallWrite>;

export const McpServerWrite = z
  .object({
    name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_.-]*$/),
    transport: z.enum(["stdio", "http"]),
    tools: z.number().int().min(0).max(1000),
    status: z.enum(["up", "slow", "down", "off"]),
    latency_ms: z.number().int().min(0).nullable(),
    egress_hosts: z.array(z.string().min(1).max(253)).max(50),
    repo_ids: z.array(z.string().uuid()).nullable(),
  })
  .strict();
export type McpServerWrite = z.infer<typeof McpServerWrite>;

export const SkillWrite = z.object({ name: z.string().min(1).max(64), description: z.string().max(200), source: z.enum(["repo", "user", "team", "builtin"]), version: z.string().max(32).nullable() }).strict();
export const PluginWrite = z.object({ name: z.string().min(1).max(80), description: z.string().max(200), kind: z.enum(["hook", "command", "check", "notify"]), enabled: z.boolean() }).strict();
export const Permission = z.enum(["allow", "ask", "deny"]);
export const PermissionWrite = z.object({ subject: z.string().min(1).max(64), tool: z.string().min(1).max(120), decision: Permission }).strict();

export const OpenWindowWrite = z
  .object({
    kind: z.enum(["terminal", "preview", "server", "log"]),
    title: z.string().min(1).max(120),
    url: z.string().max(500).refine(localUrl, { message: "only localhost" }).nullable(),
  })
  .strict();
export type OpenWindowWrite = z.infer<typeof OpenWindowWrite>;

export const NightRules = z
  .object({
    auto_merge: z.object({ min_level: z.number().int().min(0).max(3), max_lines: z.number().int().min(0).max(2000) }).strict(),
    on_fail: z.enum(["stop", "retry_once"]),
    same_file: z.enum(["wait", "allow"]),
    forbid_tools: z.array(z.string().min(1).max(120)).max(100),
  })
  .strict();
export type NightRules = z.infer<typeof NightRules>;
export const NightQueueWrite = z.object({ repo_id: z.string().uuid(), text: z.string().min(1).max(4000), risk: z.enum(["low", "medium", "high"]), est_minutes: z.number().int().min(1).max(1440), est_usd: z.number().min(0).max(1000) }).strict();

export const ResearchQuestionWrite = z.object({ id: z.string().regex(/^q_[a-z0-9_]{1,40}$/), question: z.string().min(1).max(2000), repo_id: z.string().uuid().nullable() }).strict();
export const ResearchSourceWrite = z.object({ n: z.number().int().min(1).max(999), title: z.string().min(1).max(300), url: z.string().url().max(2000), state: z.enum(["read", "weak", "failed"]) }).strict();
export const ResearchClaimWrite = z.object({ text: z.string().min(1).max(2000), verdict: z.enum(["confirmed", "single", "conflict", "unchecked"]), source_ns: z.array(z.number().int().min(1)).max(50) }).strict();

export const AgentBeat = z.object({ step: z.string().max(120), context_pct: z.number().min(0).max(100), usd: z.number().min(0).max(10_000), touching: z.array(RelPath).max(200) }).partial().strict();
export const AgentEnd = z.enum(["done", "failed", "idle"]);
export const NightPlan = z.object({ starts_at: z.string().datetime(), ends_at: z.string().datetime(), budget_usd: z.number().positive().max(10_000), rules: NightRules }).strict();
export type AgentSessionInput = z.input<typeof AgentSessionWrite>;
export type ToolCallInput = z.input<typeof ToolCallWrite>;
export type McpServerInput = z.input<typeof McpServerWrite>;
export type SkillInput = z.input<typeof SkillWrite>;
export type PluginInput = z.input<typeof PluginWrite>;
export type PermissionInput = z.input<typeof PermissionWrite>;
export type OpenWindowInput = z.input<typeof OpenWindowWrite>;
export type NightPlanInput = z.input<typeof NightPlan>;
export type NightQueueInput = z.input<typeof NightQueueWrite>;
export type ResearchQuestionInput = z.input<typeof ResearchQuestionWrite>;
export type ResearchSourceInput = z.input<typeof ResearchSourceWrite>;
export type ResearchClaimInput = z.input<typeof ResearchClaimWrite>;
