import type { AgentEvent } from "../adapter.js";

// Демо промпт т. 8.3: Codex `--json` JSONL (codex-rs/exec/src/exec_events.rs) → AgentEvent. Never throws.
type Json = Record<string, unknown>;
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

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
    case "item.completed": {
      const item = (j.item ?? {}) as Json;
      if (item.type === "agent_message" && typeof item.text === "string") return [{ type: "assistant_text", text: item.text }];
      return [{ type: "unparsed", raw: line }];
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
