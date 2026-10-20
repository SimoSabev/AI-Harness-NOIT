import type { AgentEvent } from "../adapter.js";

type Json = Record<string, unknown>;
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** stream-json → AgentEvent[]. Never throws: anything unknown becomes {type:"unparsed"}. */
export function parseStreamLine(line: string): AgentEvent[] {
  let j: Json;
  try {
    const v: unknown = JSON.parse(line);
    if (v === null || typeof v !== "object" || Array.isArray(v)) return [{ type: "unparsed", raw: line }];
    j = v as Json;
  } catch {
    return [{ type: "unparsed", raw: line }];
  }
  const type = j.type;
  if (type === "system") {
    if (j.subtype === "init") {
      return [{
        type: "init",
        sessionId: str(j.session_id),
        model: str(j.model),
        tools: arr(j.tools).filter((t): t is string => typeof t === "string"),
        mcpServers: arr(j.mcp_servers).map((m) => ({ name: str((m as Json)?.name), status: str((m as Json)?.status) })),
        capabilities: arr(j.capabilities).filter((t): t is string => typeof t === "string"),
      }];
    }
    if (j.subtype === "api_retry") {
      return [{ type: "api_retry", attempt: num(j.attempt) ?? 0, errorStatus: num(j.error_status), error: str(j.error) }];
    }
    if (j.subtype === "permission_denied") return [{ type: "permission_denied", tool: str(j.tool_name, str(j.tool)) }];
    return [{ type: "unparsed", raw: line }];
  }
  if (type === "assistant" || type === "user") {
    const content = (j.message as Json | undefined)?.content;
    if (type === "user" && typeof content === "string") return [{ type: "user_echo", text: content }];
    const out: AgentEvent[] = [];
    for (const b of arr(content)) {
      const block = b as Json;
      if (type === "assistant" && block.type === "text") out.push({ type: "assistant_text", text: str(block.text) });
      else if (type === "assistant" && block.type === "tool_use") out.push({ type: "tool_use", id: str(block.id), name: str(block.name), input: block.input ?? null });
      else if (type === "user" && block.type === "tool_result") out.push({ type: "tool_result", toolUseId: str(block.tool_use_id), isError: block.is_error === true });
      else if (type === "user" && block.type === "text") out.push({ type: "user_echo", text: str(block.text) });
    }
    return out.length > 0 ? out : [{ type: "unparsed", raw: line }];
  }
  if (type === "result") {
    return [{ type: "result", subtype: str(j.subtype), isError: j.is_error === true, totalCostUsd: num(j.total_cost_usd), numTurns: num(j.num_turns) }];
  }
  return [{ type: "unparsed", raw: line }];
}
