import type { AgentEvent } from "../adapter.js";

// Демо промпт т. 8.3: Codex `--json` JSONL (codex-rs/exec/src/exec_events.rs) → AgentEvent. Never throws.
type Json = Record<string, unknown>;
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const s = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * D-308: tool items (exec_events.rs ThreadItemDetails, checked 22.10.2026) → the same tool_use/tool_result as Claude.
 * item.started gives the tool_use; item.completed repeats it (file_change and web_search only ever complete) and closes
 * it. The recorder ignores a repeated tool_use id. A declined command is a permission_denied, not a result.
 */
function toolItem(item: Json, completed: boolean): AgentEvent[] | null {
  const id = s(item.id);
  let use: AgentEvent;
  if (item.type === "command_execution") use = { type: "tool_use", id, name: "Bash", input: { command: s(item.command) } };
  else if (item.type === "file_change") use = { type: "tool_use", id, name: "Edit", input: { paths: (Array.isArray(item.changes) ? item.changes : []).map((c) => s((c as Json)?.path)).filter(Boolean) } };
  else if (item.type === "mcp_tool_call") use = { type: "tool_use", id, name: `mcp__${s(item.server)}__${s(item.tool)}`, input: item.arguments ?? null };
  else if (item.type === "web_search") use = { type: "tool_use", id, name: "WebSearch", input: { query: s(item.query) } };
  else return null;
  if (!completed) return [use];
  if (item.status === "declined") return [use, { type: "permission_denied", tool: use.name }];
  return [use, { type: "tool_result", toolUseId: id, isError: item.status === "failed" || (item.type === "mcp_tool_call" && item.error != null) }];
}

export function parseCodexLine(line: string): AgentEvent[] {
  let j: Json;
  try {
    const v: unknown = JSON.parse(line);
    if (v === null || typeof v !== "object" || Array.isArray(v)) return [{ type: "unparsed", raw: line }];
    j = v as Json;
  } catch {
    return [{ type: "unparsed", raw: line }];
  }
  switch (j.type) {
    case "thread.started":
      return [{ type: "init", sessionId: typeof j.thread_id === "string" ? j.thread_id : "", model: "", tools: [], mcpServers: [], capabilities: [] }];
    case "item.started":
    case "item.completed": {
      const item = (j.item ?? {}) as Json;
      const done = j.type === "item.completed";
      if (done && item.type === "agent_message" && typeof item.text === "string") return [{ type: "assistant_text", text: item.text }];
      return toolItem(item, done) ?? [{ type: "unparsed", raw: line }];
    }
    case "turn.completed": {
      const u = (j.usage ?? {}) as Json;
      return [{
        type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null,
        usage: { input_tokens: n(u.input_tokens), cached_input_tokens: n(u.cached_input_tokens), cache_write_input_tokens: n(u.cache_write_input_tokens), output_tokens: n(u.output_tokens), reasoning_output_tokens: n(u.reasoning_output_tokens) },
      }];
    }
    case "turn.failed":
    case "error":
      return [{ type: "result", subtype: "error", isError: true, totalCostUsd: null, numTurns: null }];
    default:
      return [{ type: "unparsed", raw: line }];
  }
}

/** claimedDone = exit 0 AND the last parsed event is turn.completed. */
export function codexClaimedDone(events: AgentEvent[], exit: number | null): boolean {
  const last = [...events].reverse().find((e) => e.type !== "unparsed");
  return exit === 0 && last?.type === "result" && !last.isError;
}
