import { z } from "zod";
import { RelPath, redactSummary, redactText } from "./workbench.js";

// v5 2.1 / D-310: one stream for every agent adapter. Leader: session = run id; a subagent: run id + ":" + child id.
export const StreamEventKind = z.enum(["init", "text", "step", "tool_call", "tool_result", "permission", "subagent_start", "subagent_stop", "usage", "result", "unparsed"]);
export type StreamEventKind = z.infer<typeof StreamEventKind>;
export const StreamToolKind = z.enum(["mcp", "skill", "builtin", "bash", "mandat"]);
export const StreamTool = z
  .object({
    kind: StreamToolKind,
    name: z.string().max(120),
    touching: z.array(RelPath).max(50),
    decision: z.enum(["allowed", "asked", "denied", "error"]).nullable(),
  })
  .strict();
export type StreamTool = z.infer<typeof StreamTool>;
export const StreamUsage = z
  .object({
    input: z.number().int(),
    output: z.number().int(),
    cache_read: z.number().int(),
    cache_write: z.number().int(),
    context_pct: z.number().min(0).max(100).nullable(),
    usd: z.number().min(0).nullable(),
  })
  .strict();
export type StreamUsage = z.infer<typeof StreamUsage>;
export const StreamResult = z.object({ ok: z.boolean(), claimed_done: z.boolean(), error: z.string().max(300).nullable() }).strict();
export const StreamEvent = z
  .object({
    kind: StreamEventKind,
    ts: z.string().datetime(),
    seq: z.number().int().min(0),
    session: z.string().min(1).max(64),
    parent: z.string().min(1).max(64).nullable(),
    text: z.string().max(4000).nullable(), // after redaction; for tool_call a short summary (≤ 300)
    tool: StreamTool.nullable(),
    usage: StreamUsage.nullable(),
    result: StreamResult.nullable(),
  })
  .strict();
export type StreamEvent = z.infer<typeof StreamEvent>;

/** The adapter's running state: the run id, a clock, the seq counter and the subagent sessions already announced. */
export interface StreamCtx {
  readonly runId: string;
  readonly now: () => string;
  seq: number;
  readonly seen: Set<string>;
  /** adapter-private state (e.g. the model from init) */
  readonly memo: Map<string, string>;
}
export function createStreamCtx(runId: string, now: () => string = () => new Date().toISOString()): StreamCtx {
  return { runId, now, seq: 0, seen: new Set(), memo: new Map() };
}

export interface StreamInput {
  kind: StreamEventKind;
  /** a subagent's own id (e.g. Claude's parent_tool_use_id); absent for the leader */
  child?: string | null;
  text?: string | null;
  tool?: StreamTool | null;
  usage?: StreamUsage | null;
  result?: z.input<typeof StreamResult> | null;
}

export function childSession(ctx: StreamCtx, child: string): string {
  return `${ctx.runId}:${child}`.slice(0, 64);
}

/** Builds one validated event; text is redacted (tool_call: summary ≤ 300, else ≤ 4000). */
export function streamEvent(ctx: StreamCtx, i: StreamInput): StreamEvent {
  const child = i.child ?? null;
  const session = child ? childSession(ctx, child) : ctx.runId.slice(0, 64);
  const text = i.text == null ? null : i.kind === "tool_call" ? redactSummary(i.text) : redactText(i.text, 4000);
  const result = i.result ? { ...i.result, error: i.result.error == null ? null : redactSummary(i.result.error) } : null;
  return StreamEvent.parse({
    kind: i.kind,
    ts: ctx.now(),
    seq: ctx.seq++,
    session,
    parent: child ? ctx.runId.slice(0, 64) : null,
    text,
    tool: i.tool ?? null,
    usage: i.usage ?? null,
    result,
  });
}

/** context_pct = input tokens over the model window; an unknown window → null (v5 2.1 [НП]; D-341). */
export function contextPct(model: string, input: number, windows: Readonly<Record<string, number>>): number | null {
  const w = windows[model];
  if (w === undefined || w <= 0) return null;
  return Math.min(100, Math.round((input / w) * 1000) / 10);
}
