import type { AgentEvent } from "../adapter.js";
import { int, obj, parseJson, str } from "../stream-util.js";
import type { Json } from "../stream-util.js";

// D-464 (spike 04.11.2026): `mcode exec --output-format stream-json` → AgentEvent. Codex-exec-like envelopes
// {schemaVersion,sequence,timestampMs,runId,sessionId,turnId,type}; NO tool results, no cost, no turn count. A tool call is
// taken from item.completed only (item.started/updated carry streaming deltas whose arguments may be partial), so each
// call appears once without state. The toolCall shape {id,name,arguments} is [НП: a live run]. Never throws.
export function minimaxToolCall(item: Json): { id: string; name: string; input: Record<string, unknown> } {
  const tc = obj(item.toolCall);
  const fn = obj(tc.function);
  const args = tc.arguments ?? tc.input ?? fn.arguments;
  const input = typeof args === "string" ? obj(parseJson(args)) : obj(args);
  return { id: str(tc.id, str(item.id)), name: str(tc.name, str(fn.name)), input };
}

type ResultUsage = NonNullable<Extract<AgentEvent, { type: "result" }>["usage"]>;
function usageOf(u: unknown): ResultUsage | null {
  if (u === null || typeof u !== "object" || Array.isArray(u)) return null;
  const j = obj(u);
  return { input_tokens: int(j.inputTokens), cached_input_tokens: int(j.cacheReadTokens), cache_write_input_tokens: int(j.cacheWriteTokens), output_tokens: int(j.outputTokens), reasoning_output_tokens: int(j.reasoningTokens) };
}

function itemEvents(item: Json): AgentEvent[] {
  if (item.type === "agent_message" && typeof item.content === "string" && item.content.length > 0) return [{ type: "assistant_text", text: item.content }];
  if (item.type === "tool_call") {
    const { id, name, input } = minimaxToolCall(item);
    return [{ type: "tool_use", id, name, input }];
  }
  return []; // reasoning
}

function resultEvent(r: Json): AgentEvent {
  const ok = r.status === "succeeded";
  const usage = usageOf(r.usage);
  return { type: "result", subtype: ok ? "success" : str(r.status, "failed"), isError: !ok, totalCostUsd: null, numTurns: null, ...(usage ? { usage } : {}) };
}

export function parseMinimaxLine(line: string): AgentEvent[] {
  const j = parseJson(line);
  if (!j) return [{ type: "unparsed", raw: line }];
  switch (j.type) {
    case "session.started":
    case "session.resumed":
      return [{ type: "init", sessionId: str(j.sessionId), model: "", tools: [], mcpServers: [], capabilities: [] }];
    case "exec.started":
    case "turn.started":
    case "item.started":
    case "item.updated":
    case "turn.completed": // usage goes on the final result (exec.completed carries it)
      return [];
    case "item.completed":
      return itemEvents(obj(j.item));
    case "turn.failed": {
      const e = obj(j.error);
      return e.retryable === true ? [{ type: "api_retry", attempt: 0, errorStatus: null, error: str(e.code, str(e.message)) }] : [];
    }
    case "exec.completed":
      return [resultEvent(obj(j.result))];
    default:
      return [{ type: "unparsed", raw: line }];
  }
}

/** claimedDone = exit 0 AND the last parsed event is a successful result (exec.completed with status succeeded). */
export function minimaxClaimedDone(events: AgentEvent[], exit: number | null): boolean {
  const last = [...events].reverse().find((e) => e.type !== "unparsed");
  return exit === 0 && last?.type === "result" && !last.isError;
}
