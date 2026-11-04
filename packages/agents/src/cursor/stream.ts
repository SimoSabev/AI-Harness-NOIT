import type { AgentEvent } from "../adapter.js";
import { parseStreamLine } from "../claude/stream.js";
import { obj, parseJson, str } from "../stream-util.js";

// D-464 (spike 04.11.2026 §3): `agent -p --output-format stream-json` → AgentEvent. It mirrors Claude Code's stream-json
// (system/init, user, assistant), so those lines go through Claude's parser; Cursor adds `tool_call` lines (subtype
// started/completed, matched by call_id) whose `tool_call` is a protobuf oneof as JSON: {"<kind>ToolCall":{args, result}}
// (js/7000.index.js). A result is a oneof too: `success` vs failure/error/rejected/permissionDenied/… — any non-success case
// is an error [НП: a live run]. The final `result` line has no cost/turns; `usage` is {inputTokens, outputTokens,
// cacheReadTokens, cacheWriteTokens} when present (source). On an error there is NO result line (stderr + exit 1). Never throws.
type Json = Record<string, unknown>;
export interface CursorToolCase { key: string; args: Json; result: Json | null; fnName: string | null }
type ResultUsage = Extract<AgentEvent, { type: "result" }>["usage"];

/** The single oneof case of a tool_call payload: its key, args and result. */
export function cursorToolCase(toolCall: unknown): CursorToolCase {
  const t = obj(toolCall);
  const key = Object.keys(t)[0];
  if (key === undefined) return { key: "unknown", args: {}, result: null, fnName: null };
  const v = obj(t[key]);
  if (key === "function") {
    const args = typeof v.arguments === "string" ? obj(parseJson(v.arguments)) : obj(v.arguments);
    return { key, args, result: null, fnName: str(v.name) || null };
  }
  return { key, args: obj(v.args), result: "result" in v ? obj(v.result) : null, fnName: null };
}

/** A completed tool's result is an error unless its oneof case is `success`; a missing result is not an error [НП]. */
export const cursorToolFailed = (result: Json | null): boolean => result !== null && !("success" in result);

const USAGE_KEYS = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"] as const;

/** Cursor's usage object, only when all four counts are finite numbers. */
export function cursorUsage(u: unknown): Record<(typeof USAGE_KEYS)[number], number> | null {
  const x = obj(u);
  if (!USAGE_KEYS.every((k) => typeof x[k] === "number" && Number.isFinite(x[k]))) return null;
  const n = (k: (typeof USAGE_KEYS)[number]): number => Math.max(0, Math.trunc(x[k] as number));
  return { inputTokens: n("inputTokens"), outputTokens: n("outputTokens"), cacheReadTokens: n("cacheReadTokens"), cacheWriteTokens: n("cacheWriteTokens") };
}

function resultUsage(u: unknown): ResultUsage {
  const c = cursorUsage(u);
  if (!c) return undefined;
  return { input_tokens: c.inputTokens, cached_input_tokens: c.cacheReadTokens, cache_write_input_tokens: c.cacheWriteTokens, output_tokens: c.outputTokens, reasoning_output_tokens: 0 };
}

function toolCallEvents(j: Json, line: string): AgentEvent[] {
  const c = cursorToolCase(j.tool_call);
  const id = str(j.call_id);
  if (j.subtype === "started") return [{ type: "tool_use", id, name: c.fnName ?? c.key, input: c.args }];
  if (j.subtype === "completed") return [{ type: "tool_result", toolUseId: id, isError: cursorToolFailed(c.result) }];
  return [{ type: "unparsed", raw: line }];
}

export function parseCursorLine(line: string): AgentEvent[] {
  const j = parseJson(line);
  if (!j) return [{ type: "unparsed", raw: line }];
  if (j.type === "tool_call") return toolCallEvents(j, line);
  if (j.type === "result") {
    const usage = resultUsage(j.usage);
    return [{ type: "result", subtype: str(j.subtype), isError: j.is_error === true, totalCostUsd: null, numTurns: null, ...(usage ? { usage } : {}) }];
  }
  return parseStreamLine(line);
}

/** claimedDone = exit 0 AND the last parsed event is a successful result (an error prints no result line). */
export function cursorClaimedDone(events: AgentEvent[], exit: number | null): boolean {
  const last = [...events].reverse().find((e) => e.type !== "unparsed");
  return exit === 0 && last?.type === "result" && !last.isError && last.subtype === "success";
}
