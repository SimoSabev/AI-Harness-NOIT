import type { AgentEvent } from "../adapter.js";
import { arr, int, obj, parseJson, str } from "../stream-util.js";

// D-464 (spike 2026-11-04): `kimi --output-format stream-json` → AgentEvent. OpenAI-chat-shaped lines keyed by `role`
// (PromptJsonWriter), not Claude's stream-json: no init, no usage/cost, no error flag on tool results; the
// `session.resume_hint` meta line comes last and means the run finished. Shapes are from source [НП: a live run]. Never throws.
export function parseToolInput(args: unknown): Record<string, unknown> {
  return typeof args === "string" ? obj(parseJson(args)) : {};
}

function assistantEvents(j: Record<string, unknown>): AgentEvent[] {
  const out: AgentEvent[] = [];
  if (typeof j.content === "string" && j.content.length > 0) out.push({ type: "assistant_text", text: j.content });
  for (const c of arr(j.tool_calls)) {
    const call = obj(c);
    const fn = obj(call.function);
    out.push({ type: "tool_use", id: str(call.id), name: str(fn.name), input: parseToolInput(fn.arguments) });
  }
  return out;
}

function metaEvents(j: Record<string, unknown>, line: string): AgentEvent[] {
  if (j.type === "turn.step.retrying") {
    return [{ type: "api_retry", attempt: int(j.failed_attempt), errorStatus: typeof j.status_code === "number" ? j.status_code : null, error: str(j.error_name) }];
  }
  if (j.type === "session.resume_hint") return [{ type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null }];
  return [{ type: "unparsed", raw: line }];
}

export function parseKimiLine(line: string): AgentEvent[] {
  const j = parseJson(line);
  if (!j) return [{ type: "unparsed", raw: line }];
  // session busy (exit 4) and other top-level errors carry no role
  if (j.type === "error") return [{ type: "result", subtype: "error", isError: true, totalCostUsd: null, numTurns: null }];
  switch (j.role) {
    case "assistant":
      return assistantEvents(j);
    case "tool":
      return [{ type: "tool_result", toolUseId: str(j.tool_call_id), isError: false }];
    case "meta":
      return metaEvents(j, line);
    default:
      return [{ type: "unparsed", raw: line }];
  }
}

/** claimedDone = exit 0 AND the last parsed event is a successful result (the resume hint). */
export function kimiClaimedDone(events: AgentEvent[], exit: number | null): boolean {
  const last = [...events].reverse().find((e) => e.type !== "unparsed");
  return exit === 0 && last?.type === "result" && !last.isError;
}
