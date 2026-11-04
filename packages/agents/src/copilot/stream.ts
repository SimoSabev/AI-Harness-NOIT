import type { AgentEvent } from "../adapter.js";
import { int, obj, parseJson, str } from "../stream-util.js";

// D-464 (spike 04.11.2026, §3): `copilot -p --output-format json` → AgentEvent. JSONL session events with the envelope
// {id, timestamp, parentId, ephemeral?, type, data} (session-events.schema.json). Tool calls come only from
// tool.execution_start (assistant.message.toolRequests would duplicate them). The usage shape inside
// session.shutdown.modelMetrics and whether ephemeral events are printed are [НП: a live run]. Never throws.
type Usage = NonNullable<Extract<AgentEvent, { type: "result" }>["usage"]>;
/** Known event types with nothing to report here (assistant.usage goes to toStream only). */
export const COPILOT_QUIET = new Set(["user.message", "assistant.turn_start", "assistant.turn_end", "assistant.message_delta", "assistant.reasoning", "assistant.reasoning_delta", "session.task_complete", "session.info"]);
const result = (ok: boolean, usage?: Usage): AgentEvent => ({ type: "result", subtype: ok ? "success" : "error", isError: !ok, totalCostUsd: null, numTurns: null, ...(usage ? { usage } : {}) });

/** Sums token usage over data.modelMetrics[model].usage; none when no model carries a usage object [НП]. */
export function shutdownUsage(metrics: unknown): Usage | undefined {
  const us = Object.values(obj(metrics)).map((m) => obj(m).usage).filter((u) => u !== null && typeof u === "object");
  if (us.length === 0) return undefined;
  const sum = (k: string) => us.reduce<number>((n, u) => n + int(obj(u)[k]), 0);
  return { input_tokens: sum("inputTokens"), cached_input_tokens: sum("cacheReadTokens"), cache_write_input_tokens: sum("cacheWriteTokens"), output_tokens: sum("outputTokens"), reasoning_output_tokens: sum("reasoningTokens") };
}

export function parseCopilotLine(line: string): AgentEvent[] {
  const j = parseJson(line);
  if (!j || typeof j.type !== "string") return [{ type: "unparsed", raw: line }];
  const d = obj(j.data);
  switch (j.type) {
    case "session.start":
      return [{ type: "init", sessionId: str(d.sessionId), model: str(d.selectedModel), tools: [], mcpServers: [], capabilities: [] }];
    case "assistant.message":
      return typeof d.content === "string" && d.content.length > 0 ? [{ type: "assistant_text", text: d.content }] : [];
    case "tool.execution_start":
      return [{ type: "tool_use", id: str(d.toolCallId), name: str(d.toolName), input: obj(d.arguments) }];
    case "tool.execution_complete":
      return [{ type: "tool_result", toolUseId: str(d.toolCallId), isError: d.success !== true }];
    case "session.error":
      return [result(false)];
    case "session.shutdown":
      return [result(true, shutdownUsage(d.modelMetrics))];
    case "assistant.usage":
      return [];
    default:
      return COPILOT_QUIET.has(j.type) ? [] : [{ type: "unparsed", raw: line }];
  }
}

/** claimedDone = exit 0, no session.error, and the last parsed event is the successful shutdown result. */
export function copilotClaimedDone(events: AgentEvent[], exit: number | null): boolean {
  if (events.some((e) => e.type === "result" && e.isError)) return false;
  const last = [...events].reverse().find((e) => e.type !== "unparsed");
  return exit === 0 && last?.type === "result" && !last.isError;
}
