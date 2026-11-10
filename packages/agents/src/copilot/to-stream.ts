import { contextPct, streamEvent } from "@mandat/contract";
import type { StreamCtx, StreamEvent, StreamTool } from "@mandat/contract";
import { int, obj, parseJson, paths, str } from "../stream-util.js";
import { COPILOT_QUIET } from "./stream.js";

// v5 2.1 / D-464 (spike 04.11.2026, §3): Copilot CLI JSONL session events → StreamEvent[]. bash/shell/powershell are bash
// (only `bash` is in the spike's sample; the others are [НП]); a call with mcpServerName is MCP (`mandat` → mandat), its
// tool name with a `<server>-` prefix stripped [НП]; the rest are built-ins. usd = assistant.usage.cost when numeric
// [НП: it may be premium-request units, not USD]. A session.error is kept in ctx.memo so the shutdown stays not ok.
const FILE_KEYS = ["path", "file_path", "filePath"];
const SHELL = /^(bash|shell|powershell)$/i;
const ERR = "copilot:error";
type Tool = Omit<StreamTool, "decision">;

function toolOf(d: Record<string, unknown>): { tool: Tool; text: string | null } {
  const name = str(d.toolName);
  const input = obj(d.arguments);
  if (SHELL.test(name)) return { tool: { kind: "bash", name: name.slice(0, 120), touching: [] }, text: typeof input.command === "string" ? input.command : null };
  const server = str(d.mcpServerName);
  if (server.length > 0) {
    const t = name.startsWith(`${server}-`) ? name.slice(server.length + 1) : name;
    const full = `${server}.${t}`.slice(0, 120);
    return { tool: { kind: server === "mandat" ? "mandat" : "mcp", name: full, touching: [] }, text: full };
  }
  const touching = paths(FILE_KEYS.map((k) => input[k]));
  return { tool: { kind: "builtin", name: name.slice(0, 120), touching }, text: touching.length > 0 ? `${name} ${touching.join(", ")}` : name };
}

function toolCall(d: Record<string, unknown>, ctx: StreamCtx): StreamEvent {
  const { tool, text } = toolOf(d);
  ctx.memo.set(`copilot:${str(d.toolCallId)}`, JSON.stringify(tool));
  return streamEvent(ctx, { kind: "tool_call", text, tool: { ...tool, decision: null } });
}

function toolResult(d: Record<string, unknown>, ctx: StreamCtx): StreamEvent {
  const kept = ctx.memo.get(`copilot:${str(d.toolCallId)}`);
  const tool: Tool = kept ? (JSON.parse(kept) as Tool) : { kind: "builtin", name: "unknown", touching: [] };
  return streamEvent(ctx, { kind: "tool_result", text: null, tool: { ...tool, decision: d.success === true ? "allowed" : "error" } });
}

function usage(d: Record<string, unknown>, ctx: StreamCtx, windows: Readonly<Record<string, number>>): StreamEvent {
  const input = int(d.inputTokens);
  const usd = typeof d.cost === "number" && Number.isFinite(d.cost) && d.cost >= 0 ? d.cost : null;
  return streamEvent(ctx, { kind: "usage", usage: { input, output: int(d.outputTokens), cache_read: int(d.cacheReadTokens), cache_write: int(d.cacheWriteTokens), context_pct: contextPct(str(d.model), input, windows), usd } });
}

function sessionEnd(ctx: StreamCtx): StreamEvent {
  const err = ctx.memo.get(ERR);
  return streamEvent(ctx, { kind: "result", result: err === undefined ? { ok: true, claimed_done: true, error: null } : { ok: false, claimed_done: false, error: err } });
}

function sessionError(d: Record<string, unknown>, ctx: StreamCtx): StreamEvent {
  const msg = str(d.message, "error");
  ctx.memo.set(ERR, msg);
  return streamEvent(ctx, { kind: "result", result: { ok: false, claimed_done: false, error: msg } });
}

export function copilotToStream(line: string, ctx: StreamCtx, windows: Readonly<Record<string, number>> = {}): StreamEvent[] {
  const j = parseJson(line);
  if (!j || typeof j.type !== "string") return [streamEvent(ctx, { kind: "unparsed", text: line })];
  const d = obj(j.data);
  switch (j.type) {
    case "session.start":
      return [streamEvent(ctx, { kind: "init", text: null })];
    case "assistant.message":
      return typeof d.content === "string" && d.content.length > 0 ? [streamEvent(ctx, { kind: "text", text: d.content })] : [];
    case "assistant.usage":
      return [usage(d, ctx, windows)];
    case "tool.execution_start":
      return [toolCall(d, ctx)];
    case "tool.execution_complete":
      return [toolResult(d, ctx)];
    case "session.error":
      return [sessionError(d, ctx)];
    case "session.shutdown":
      return [sessionEnd(ctx)];
    default:
      return COPILOT_QUIET.has(j.type) ? [] : [streamEvent(ctx, { kind: "unparsed", text: line })];
  }
}
