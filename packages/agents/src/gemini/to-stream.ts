import { streamEvent } from "@mandat/contract";
import type { StreamCtx, StreamEvent, StreamTool } from "@mandat/contract";
import { int, obj, parseJson, paths, str } from "../stream-util.js";

// v5 2.1 / E9в (D-423): Gemini CLI stream-json → StreamEvent[]. Tool names are the CLI's built-ins (run_shell_command,
// read_file, write_file, replace, …) and MCP tools as mcp_<server>_<tool> [НП: the exact MCP prefix in a live stream].
// A tool_result names only its tool_id, so the call's tool is kept in ctx.memo. Never throws.
const FILE_KEYS = ["file_path", "absolute_path", "path", "dir_path"];

function toolOf(name: string, params: Record<string, unknown>): { tool: Omit<StreamTool, "decision">; text: string } {
  if (name === "run_shell_command") return { tool: { kind: "bash", name, touching: [] }, text: str(params.command) };
  const mcp = /^mcp_([^_]+)_(.+)$/.exec(name);
  if (mcp) {
    const [, server, t] = mcp as unknown as [string, string, string];
    const full = `${server}.${t}`.slice(0, 120);
    return { tool: { kind: server === "mandat" ? "mandat" : "mcp", name: full, touching: [] }, text: full };
  }
  const touching = paths(FILE_KEYS.map((k) => params[k]));
  return { tool: { kind: "builtin", name: name.slice(0, 120), touching }, text: touching.length > 0 ? `${name} ${touching.join(", ")}` : name };
}

export function geminiToStream(line: string, ctx: StreamCtx, _windows: Readonly<Record<string, number>> = {}): StreamEvent[] {
  const j = parseJson(line);
  if (!j) return [streamEvent(ctx, { kind: "unparsed", text: line })];
  switch (j.type) {
    case "init":
      return [streamEvent(ctx, { kind: "init", text: str(j.session_id) || null })];
    case "message":
      if (j.role === "assistant") return [streamEvent(ctx, { kind: "text", text: str(j.content) })];
      return [streamEvent(ctx, { kind: "step", text: "task" })];
    case "tool_use": {
      const { tool, text } = toolOf(str(j.tool_name), obj(j.parameters));
      ctx.memo.set(`gemini:${str(j.tool_id)}`, JSON.stringify(tool));
      return [streamEvent(ctx, { kind: "tool_call", text, tool: { ...tool, decision: null } })];
    }
    case "tool_result": {
      const kept = ctx.memo.get(`gemini:${str(j.tool_id)}`);
      const tool = kept ? (JSON.parse(kept) as Omit<StreamTool, "decision">) : { kind: "builtin" as const, name: "unknown", touching: [] };
      return [streamEvent(ctx, { kind: "tool_result", text: null, tool: { ...tool, decision: j.status === "success" ? "allowed" : "error" } })];
    }
    case "error":
      return [streamEvent(ctx, { kind: "step", text: str(j.message, "error") })];
    case "result": {
      const ok = j.status === "success";
      const out: StreamEvent[] = [];
      if (j.stats !== undefined) {
        const s = obj(j.stats);
        out.push(streamEvent(ctx, { kind: "usage", usage: { input: int(s.input_tokens), output: int(s.output_tokens), cache_read: int(s.cached), cache_write: 0, context_pct: null, usd: null } }));
      }
      out.push(streamEvent(ctx, { kind: "result", result: { ok, claimed_done: ok, error: ok ? null : str(obj(j.error).message, "error") } }));
      return out;
    }
    default:
      return [streamEvent(ctx, { kind: "unparsed", text: line })];
  }
}
