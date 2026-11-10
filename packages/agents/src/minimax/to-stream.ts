import { contextPct, streamEvent } from "@mandat/contract";
import type { StreamCtx, StreamEvent, StreamTool } from "@mandat/contract";
import { int, obj, parseJson, paths, str } from "../stream-util.js";
import type { Json } from "../stream-util.js";
import { minimaxToolCall } from "./stream.js";

// v5 2.1 / D-464 (spike 04.11.2026): MiniMax Code stream-json → StreamEvent[]. mcode never emits tool results, so a
// tool_call has no matching tool_result (decision null). Tool names are [НП]: a shell-like name is bash, mcp__<server>__<tool>
// or mcp_<server>_<tool> is MCP [НП: the prefix], the rest are built-ins with the paths they touch. Never throws.
const FILE_KEYS = ["path", "file_path", "filePath", "absolute_path"];
const SHELL = /^(shell|bash|run_?shell|execute|exec_command|terminal)/i;
const MCP = /^mcp__?([^_]+)__?(.+)$/;

function toolOf(name: string, input: Record<string, unknown>): { tool: StreamTool; text: string } {
  if (SHELL.test(name)) return { tool: { kind: "bash", name: name.slice(0, 120), touching: [], decision: null }, text: str(input.command, str(input.cmd)) };
  const mcp = MCP.exec(name);
  if (mcp) {
    const [, server, t] = mcp as unknown as [string, string, string];
    const full = `${server}.${t}`.slice(0, 120);
    return { tool: { kind: server === "mandat" ? "mandat" : "mcp", name: full, touching: [], decision: null }, text: full };
  }
  const touching = paths(FILE_KEYS.map((k) => input[k]));
  return { tool: { kind: "builtin", name: name.slice(0, 120), touching, decision: null }, text: touching.length > 0 ? `${name} ${touching.join(", ")}` : name };
}

function itemStream(item: Json, ctx: StreamCtx): StreamEvent[] {
  if (item.type === "agent_message" && typeof item.content === "string" && item.content.length > 0) return [streamEvent(ctx, { kind: "text", text: item.content })];
  if (item.type !== "tool_call") return [];
  const { name, input } = minimaxToolCall(item);
  const { tool, text } = toolOf(name, input);
  return [streamEvent(ctx, { kind: "tool_call", text, tool })];
}

function usageStream(j: Json, ctx: StreamCtx, windows: Readonly<Record<string, number>>): StreamEvent {
  const u = obj(j.usage);
  const m = obj(j.model);
  const input = int(u.inputTokens);
  const pct = contextPct(str(m.modelId), input, windows) ?? contextPct(`${str(m.providerId)}/${str(m.modelId)}`, input, windows);
  return streamEvent(ctx, { kind: "usage", usage: { input, output: int(u.outputTokens), cache_read: int(u.cacheReadTokens), cache_write: int(u.cacheWriteTokens), context_pct: pct, usd: null } });
}

function resultStream(r: Json, ctx: StreamCtx): StreamEvent {
  const ok = r.status === "succeeded";
  return streamEvent(ctx, { kind: "result", result: { ok, claimed_done: ok, error: ok ? null : str(obj(r.error).message, str(r.status, "failed")) } });
}

export function minimaxToStream(line: string, ctx: StreamCtx, windows: Readonly<Record<string, number>> = {}): StreamEvent[] {
  const j = parseJson(line);
  if (!j) return [streamEvent(ctx, { kind: "unparsed", text: line })];
  switch (j.type) {
    case "session.started":
    case "session.resumed":
      return [streamEvent(ctx, { kind: "init", text: str(j.sessionId) || null })];
    case "exec.started":
    case "turn.started":
    case "item.started":
    case "item.updated":
      return [];
    case "item.completed":
      return itemStream(obj(j.item), ctx);
    case "turn.completed":
      return [usageStream(j, ctx, windows)];
    case "turn.failed":
      return [streamEvent(ctx, { kind: "step", text: obj(j.error).retryable === true ? "retry" : "error" })];
    case "exec.completed":
      return [resultStream(obj(j.result), ctx)];
    default:
      return [streamEvent(ctx, { kind: "unparsed", text: line })];
  }
}
