import { streamEvent } from "@mandat/contract";
import type { StreamCtx, StreamEvent, StreamTool } from "@mandat/contract";
import { arr, int, obj, parseJson, paths, str } from "../stream-util.js";

// v5 2.1: Codex `exec --json` JSONL (codex-rs/exec/src/exec_events.rs @ c260087) → StreamEvent[]. Never throws.
const TOOL_ITEMS = new Set(["command_execution", "file_change", "mcp_tool_call", "web_search"]);

function toolOf(item: Record<string, unknown>): { tool: Omit<StreamTool, "decision">; text: string } {
  switch (item.type) {
    case "command_execution":
      return { tool: { kind: "bash", name: "bash", touching: [] }, text: str(item.command) };
    case "file_change": {
      const ps = arr(item.changes).map((c) => obj(c).path);
      return { tool: { kind: "builtin", name: "file_change", touching: paths(ps) }, text: `file_change ${paths(ps).join(", ")}` };
    }
    case "mcp_tool_call": {
      const server = str(item.server);
      return { tool: { kind: server === "mandat" ? "mandat" : "mcp", name: `${server}.${str(item.tool)}`.slice(0, 120), touching: [] }, text: `${server}.${str(item.tool)}` };
    }
    default:
      return { tool: { kind: "builtin", name: "web_search", touching: [] }, text: `web_search ${str(item.query)}` };
  }
}
function failed(item: Record<string, unknown>): boolean {
  if (item.status === "failed" || item.status === "declined") return true;
  if (item.type === "command_execution" && typeof item.exit_code === "number") return item.exit_code !== 0;
  return item.error != null;
}

export function codexToStream(line: string, ctx: StreamCtx, _windows: Readonly<Record<string, number>> = {}): StreamEvent[] {
  const j = parseJson(line);
  if (!j) return [streamEvent(ctx, { kind: "unparsed", text: line })];
  switch (j.type) {
    case "thread.started":
      return [streamEvent(ctx, { kind: "init", text: str(j.thread_id) || null })];
    case "turn.started":
      return [streamEvent(ctx, { kind: "step", text: "turn started" })];
    case "item.started":
    case "item.updated":
    case "item.completed": {
      const item = obj(j.item);
      const id = str(item.id);
      const done = j.type === "item.completed";
      if (item.type === "agent_message") return done ? [streamEvent(ctx, { kind: "text", text: str(item.text) })] : [];
      if (item.type === "reasoning") return done ? [streamEvent(ctx, { kind: "step", text: str(item.text).slice(0, 120) })] : [];
      if (item.type === "todo_list") return [streamEvent(ctx, { kind: "step", text: `todo ${arr(item.items).length}` })];
      if (item.type === "error") return [streamEvent(ctx, { kind: "step", text: str(item.message) })];
      if (item.type === "collab_tool_call") {
        const child = str(arr(item.receiver_thread_ids)[0], id) || id;
        if (j.type === "item.started" && !ctx.seen.has(child)) {
          ctx.seen.add(child);
          return [streamEvent(ctx, { kind: "subagent_start", child, text: str(item.prompt).slice(0, 300) || null })];
        }
        if (done) {
          const out: StreamEvent[] = [];
          if (!ctx.seen.has(child)) {
            ctx.seen.add(child);
            out.push(streamEvent(ctx, { kind: "subagent_start", child, text: null }));
          }
          out.push(streamEvent(ctx, { kind: "subagent_stop", child, result: { ok: !failed(item), claimed_done: !failed(item), error: null } }));
          return out;
        }
        return [];
      }
      if (TOOL_ITEMS.has(str(item.type))) {
        const { tool, text } = toolOf(item);
        const out: StreamEvent[] = [];
        const key = `item:${id}`;
        if (!ctx.memo.has(key)) {
          ctx.memo.set(key, "1");
          out.push(streamEvent(ctx, { kind: "tool_call", text, tool: { ...tool, decision: null } }));
        }
        if (done) out.push(streamEvent(ctx, { kind: "tool_result", text: null, tool: { ...tool, decision: failed(item) ? "error" : "allowed" } }));
        return out;
      }
      return [streamEvent(ctx, { kind: "unparsed", text: line })];
    }
    case "turn.completed": {
      const u = obj(j.usage);
      return [
        streamEvent(ctx, { kind: "usage", usage: { input: int(u.input_tokens), output: int(u.output_tokens), cache_read: int(u.cached_input_tokens), cache_write: int(u.cache_write_input_tokens), context_pct: null, usd: null } }),
        streamEvent(ctx, { kind: "result", result: { ok: true, claimed_done: true, error: null } }),
      ];
    }
    case "turn.failed":
    case "error": {
      const msg = str(obj(j.error).message, str(j.message, "error"));
      if (j.type === "error") return [streamEvent(ctx, { kind: "step", text: msg })];
      return [streamEvent(ctx, { kind: "result", result: { ok: false, claimed_done: false, error: msg } })];
    }
    default:
      return [streamEvent(ctx, { kind: "unparsed", text: line })];
  }
}
