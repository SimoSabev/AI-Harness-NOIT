import { streamEvent } from "@mandat/contract";
import type { StreamCtx, StreamEvent, StreamTool } from "@mandat/contract";
import { arr, obj, parseJson, paths, str } from "../stream-util.js";
import { cursorToolCase, cursorToolFailed, cursorUsage } from "./stream.js";

// v5 2.1 / D-464 (spike 04.11.2026 §3): Cursor CLI stream-json → StreamEvent[]. shellToolCall → bash (the command);
// mcpToolCall → mcp, or mandat when the provider is ours (the providerIdentifier value is [НП]); read/edit/write/delete/ls →
// builtin touching args.path; the rest builtin by the kind's name. The completed line carries the whole tool_call, so the
// tool is rebuilt from it (no memo). A `user` line is the prompt echo (the contract) and emits nothing. Never throws.
type Tool = Omit<StreamTool, "decision">;
const PATH_KINDS = new Set(["read", "edit", "write", "delete", "ls"]);
const MANDAT = /(^|[-_:.])mandat$/;

function mcpTool(args: Record<string, unknown>): { tool: Tool; text: string } {
  const server = str(args.providerIdentifier, str(args.serverIdentifier));
  const t = str(args.toolName, str(args.name));
  const ours = MANDAT.test(server);
  const full = (ours ? `mandat.${t}` : server && t ? `${server}.${t}` : server || t || "mcp").slice(0, 120);
  return { tool: { kind: ours ? "mandat" : "mcp", name: full, touching: [] }, text: full };
}

function toolOf(toolCall: unknown): { tool: Tool; text: string } {
  const c = cursorToolCase(toolCall);
  if (c.key === "shellToolCall") return { tool: { kind: "bash", name: "shell", touching: [] }, text: str(c.args.command) };
  if (c.key === "mcpToolCall") return mcpTool(c.args);
  const name = (c.fnName ?? c.key.replace(/ToolCall$/, "")).slice(0, 120) || "unknown";
  const touching = PATH_KINDS.has(name) ? paths([c.args.path]) : [];
  return { tool: { kind: "builtin", name, touching }, text: touching.length > 0 ? `${name} ${touching.join(", ")}` : name };
}

function messageText(j: Record<string, unknown>): string {
  return arr(obj(j.message).content).map((b) => (obj(b).type === "text" ? str(obj(b).text) : "")).join("");
}

function toolCallStream(j: Record<string, unknown>, ctx: StreamCtx, line: string): StreamEvent[] {
  const { tool, text } = toolOf(j.tool_call);
  if (j.subtype === "started") return [streamEvent(ctx, { kind: "tool_call", text, tool: { ...tool, decision: null } })];
  if (j.subtype === "completed") {
    const failed = cursorToolFailed(cursorToolCase(j.tool_call).result);
    return [streamEvent(ctx, { kind: "tool_result", text: null, tool: { ...tool, decision: failed ? "error" : "allowed" } })];
  }
  return [streamEvent(ctx, { kind: "unparsed", text: line })];
}

function resultStream(j: Record<string, unknown>, ctx: StreamCtx): StreamEvent[] {
  const out: StreamEvent[] = [];
  const u = cursorUsage(j.usage);
  if (u) out.push(streamEvent(ctx, { kind: "usage", usage: { input: u.inputTokens, output: u.outputTokens, cache_read: u.cacheReadTokens, cache_write: u.cacheWriteTokens, context_pct: null, usd: null } }));
  const ok = j.subtype === "success" && j.is_error !== true;
  out.push(streamEvent(ctx, { kind: "result", result: { ok, claimed_done: ok, error: ok ? null : str(j.subtype, "error") } }));
  return out;
}

export function cursorToStream(line: string, ctx: StreamCtx, _windows: Readonly<Record<string, number>> = {}): StreamEvent[] {
  const j = parseJson(line);
  if (!j) return [streamEvent(ctx, { kind: "unparsed", text: line })];
  switch (j.type) {
    case "system":
      if (j.subtype !== "init") return [streamEvent(ctx, { kind: "unparsed", text: line })];
      ctx.memo.set("model", str(j.model));
      return [streamEvent(ctx, { kind: "init", text: str(j.session_id) || null })];
    case "user":
      return [];
    case "assistant": {
      const text = messageText(j);
      return text.length > 0 ? [streamEvent(ctx, { kind: "text", text })] : [];
    }
    case "tool_call":
      return toolCallStream(j, ctx, line);
    case "result":
      return resultStream(j, ctx);
    default:
      return [streamEvent(ctx, { kind: "unparsed", text: line })];
  }
}
