import type { AgentEvent } from "../adapter.js";
import { int, obj, parseJson, str } from "../stream-util.js";

// E9в (D-423): `gemini --output-format stream-json` (packages/core/src/output/types.ts of gemini-cli) → AgentEvent.
// Events: init, message (user|assistant, delta), tool_use, tool_result, error (warning|error), result. Never throws.
export function parseGeminiLine(line: string): AgentEvent[] {
  const j = parseJson(line);
  if (!j) return [{ type: "unparsed", raw: line }];
  switch (j.type) {
    case "init":
      return [{ type: "init", sessionId: str(j.session_id), model: str(j.model), tools: [], mcpServers: [], capabilities: [] }];
    case "message":
      if (j.role === "assistant") return [{ type: "assistant_text", text: str(j.content) }];
      if (j.role === "user") return [{ type: "user_echo", text: str(j.content) }];
      return [{ type: "unparsed", raw: line }];
    case "tool_use":
      return [{ type: "tool_use", id: str(j.tool_id), name: str(j.tool_name), input: obj(j.parameters) }];
    case "tool_result":
      return [{ type: "tool_result", toolUseId: str(j.tool_id), isError: j.status !== "success" }];
    case "result": {
      const ok = j.status === "success";
      const s = obj(j.stats);
      return [{
        type: "result", subtype: ok ? "success" : "error", isError: !ok, totalCostUsd: null, numTurns: null,
        ...(j.stats !== undefined ? { usage: { input_tokens: int(s.input_tokens), cached_input_tokens: int(s.cached), cache_write_input_tokens: 0, output_tokens: int(s.output_tokens), reasoning_output_tokens: 0 } } : {}),
      }];
    }
    default:
      return [{ type: "unparsed", raw: line }];
  }
}

/** claimedDone = exit 0 AND the last parsed event is a successful result. */
export function geminiClaimedDone(events: AgentEvent[], exit: number | null): boolean {
  const last = [...events].reverse().find((e) => e.type !== "unparsed");
  return exit === 0 && last?.type === "result" && !last.isError;
}
