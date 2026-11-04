import { streamEvent } from "@mandat/contract";
import type { StreamCtx, StreamEvent, StreamTool } from "@mandat/contract";
import { arr, obj, parseJson, paths, str } from "../stream-util.js";
import { parseToolInput } from "./stream.js";

// v5 2.1 / D-464 (spike 2026-11-04): Kimi Code CLI stream-json → StreamEvent[]. Kimi's tool names are [НП]: a shell-like
// name (Shell, bash, run_shell, execute…) is bash; mcp__<server>__<tool> or mcp_<server>_<tool> is MCP [НП: the prefix];
// the rest are built-ins. A tool result names only tool_call_id, so the call's tool is kept in ctx.memo. Never throws.
const FILE_KEYS = ["path", "file_path", "filePath", "absolute_path"];
const SHELL = /^(shell|bash|run_?shell|execute)/i;
const MCP = /^mcp__?([^_]+)__?(.+)$/;
type Tool = Omit<StreamTool, "decision">;

function toolOf(name: string, input: Record<string, unknown>): { tool: Tool; text: string } {
  if (SHELL.test(name)) return { tool: { kind: "bash", name: name.slice(0, 120), touching: [] }, text: str(input.command) };
  const mcp = MCP.exec(name);
  if (mcp) {
    const [, server, t] = mcp as unknown as [string, string, string];
    const full = `${server}.${t}`.slice(0, 120);
    return { tool: { kind: server === "mandat" ? "mandat" : "mcp", name: full, touching: [] }, text: full };
  }
  const touching = paths(FILE_KEYS.map((k) => input[k]));
  return { tool: { kind: "builtin", name: name.slice(0, 120), touching }, text: touching.length > 0 ? `${name} ${touching.join(", ")}` : name };
}

function assistantStream(j: Record<string, unknown>, ctx: StreamCtx): StreamEvent[] {
  const out: StreamEvent[] = [];
  if (typeof j.content === "string" && j.content.length > 0) out.push(streamEvent(ctx, { kind: "text", text: j.content }));
  for (const c of arr(j.tool_calls)) {
    const call = obj(c);
    const fn = obj(call.function);
    const { tool, text } = toolOf(str(fn.name), parseToolInput(fn.arguments));
    ctx.memo.set(`kimi:${str(call.id)}`, JSON.stringify(tool));
    out.push(streamEvent(ctx, { kind: "tool_call", text, tool: { ...tool, decision: null } }));
  }
  return out;
}

function toolResult(j: Record<string, unknown>, ctx: StreamCtx): StreamEvent {
  const kept = ctx.memo.get(`kimi:${str(j.tool_call_id)}`);
  const tool: Tool = kept ? (JSON.parse(kept) as Tool) : { kind: "builtin", name: "unknown", touching: [] };
  // the CLI has no error flag on a tool result
  return streamEvent(ctx, { kind: "tool_result", text: null, tool: { ...tool, decision: "allowed" } });
}

function metaStream(j: Record<string, unknown>, ctx: StreamCtx, line: string): StreamEvent[] {
  switch (j.type) {
    case "system.version":
      return [streamEvent(ctx, { kind: "init", text: null })];
    case "turn.step.retrying":
      return [streamEvent(ctx, { kind: "step", text: "retry" })];
    case "session.resume_hint":
      return [streamEvent(ctx, { kind: "result", result: { ok: true, claimed_done: true, error: null } })];
    default:
      return [streamEvent(ctx, { kind: "unparsed", text: line })];
  }
}

export function kimiToStream(line: string, ctx: StreamCtx, _windows: Readonly<Record<string, number>> = {}): StreamEvent[] {
  const j = parseJson(line);
  if (!j) return [streamEvent(ctx, { kind: "unparsed", text: line })];
  if (j.type === "error") return [streamEvent(ctx, { kind: "result", result: { ok: false, claimed_done: false, error: str(j.message, "error") } })];
  switch (j.role) {
    case "assistant":
      return assistantStream(j, ctx);
    case "tool":
      return [toolResult(j, ctx)];
    case "meta":
      return metaStream(j, ctx, line);
    default:
      return [streamEvent(ctx, { kind: "unparsed", text: line })];
  }
}
