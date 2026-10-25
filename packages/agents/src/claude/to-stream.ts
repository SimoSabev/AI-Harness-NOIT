import { contextPct, streamEvent } from "@mandat/contract";
import type { StreamCtx, StreamEvent, StreamTool } from "@mandat/contract";
import { arr, int, obj, parseJson, paths, str } from "../stream-util.js";

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const READ_TOOLS = new Set(["Read"]);
const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);

/** Claude tool name → stream tool kind and display name (mcp__server__tool → server.tool). */
export function claudeTool(name: string): Pick<StreamTool, "kind" | "name"> {
  const m = /^mcp__([^_].*?)__(.+)$/.exec(name);
  if (m) return { kind: m[1] === "mandat" ? "mandat" : "mcp", name: `${m[1]}.${m[2]}`.slice(0, 120) };
  if (name === "Bash") return { kind: "bash", name };
  if (name === "Skill") return { kind: "skill", name };
  return { kind: "builtin", name: name.slice(0, 120) };
}

function summary(name: string, input: Record<string, unknown>): string {
  if (name === "Bash") return str(input.command);
  const p = str(input.file_path, str(input.path, str(input.notebook_path, str(input.pattern, str(input.url)))));
  return p ? `${name} ${p}` : str(input.description, name);
}

/**
 * Claude Code stream-json → StreamEvent[] (v5 2.1). Never throws. A line with parent_tool_use_id belongs to that
 * subagent (session run:child); its first appearance opens the subagent; the tool_result of the spawning call closes it.
 */
export function claudeToStream(line: string, ctx: StreamCtx, windows: Readonly<Record<string, number>> = {}): StreamEvent[] {
  const j = parseJson(line);
  if (!j) return [streamEvent(ctx, { kind: "unparsed", text: line })];
  const child = typeof j.parent_tool_use_id === "string" && j.parent_tool_use_id.length > 0 ? j.parent_tool_use_id : null;
  const out: StreamEvent[] = [];
  if (child && !ctx.seen.has(child)) {
    ctx.seen.add(child);
    out.push(streamEvent(ctx, { kind: "subagent_start", child, text: ctx.memo.get(`desc:${child}`) ?? null }));
  }
  const type = j.type;
  if (type === "system") {
    if (j.subtype === "init") {
      ctx.memo.set("model", str(j.model));
      out.push(streamEvent(ctx, { kind: "init", child, text: str(j.model) || null }));
    } else if (j.subtype === "permission_denied") {
      const t = claudeTool(str(j.tool_name, str(j.tool)));
      out.push(streamEvent(ctx, { kind: "permission", child, text: t.name, tool: { ...t, touching: [], decision: "denied" } }));
    } else if (j.subtype === "api_retry") {
      out.push(streamEvent(ctx, { kind: "step", child, text: `api retry ${int(j.attempt)}` }));
    } else out.push(streamEvent(ctx, { kind: "unparsed", child, text: line }));
    return out;
  }
  if (type === "assistant" || type === "user") {
    const msg = obj(j.message);
    const content = msg.content;
    if (typeof content === "string") {
      out.push(streamEvent(ctx, { kind: "text", child, text: content }));
      return out;
    }
    for (const b of arr(content)) {
      const block = obj(b);
      if (type === "assistant" && block.type === "text") out.push(streamEvent(ctx, { kind: "text", child, text: str(block.text) }));
      else if (type === "assistant" && block.type === "thinking") out.push(streamEvent(ctx, { kind: "step", child, text: str(block.thinking).slice(0, 120) }));
      else if (type === "assistant" && block.type === "tool_use") {
        const name = str(block.name);
        const input = obj(block.input);
        const id = str(block.id);
        ctx.memo.set(`tool:${id}`, name);
        if (SUBAGENT_TOOLS.has(name)) ctx.memo.set(`desc:${id}`, str(input.description, str(input.subagent_type)));
        const touching = WRITE_TOOLS.has(name) || READ_TOOLS.has(name) ? paths([input.file_path, input.path, input.notebook_path]) : [];
        out.push(streamEvent(ctx, { kind: "tool_call", child, text: summary(name, input), tool: { ...claudeTool(name), touching, decision: null } }));
      } else if (type === "user" && block.type === "tool_result") {
        const id = str(block.tool_use_id);
        const name = ctx.memo.get(`tool:${id}`) ?? "unknown";
        const isError = block.is_error === true;
        out.push(streamEvent(ctx, { kind: "tool_result", child, text: null, tool: { ...claudeTool(name), touching: [], decision: isError ? "error" : "allowed" } }));
        if (ctx.seen.has(id)) out.push(streamEvent(ctx, { kind: "subagent_stop", child: id, text: null, result: { ok: !isError, claimed_done: !isError, error: null } }));
      } else if (type === "user" && block.type === "text") out.push(streamEvent(ctx, { kind: "text", child, text: str(block.text) }));
    }
    const u = obj(msg.usage);
    if (type === "assistant" && Object.keys(u).length > 0) {
      const input = int(u.input_tokens) + int(u.cache_read_input_tokens) + int(u.cache_creation_input_tokens);
      out.push(
        streamEvent(ctx, {
          kind: "usage",
          child,
          usage: { input: int(u.input_tokens), output: int(u.output_tokens), cache_read: int(u.cache_read_input_tokens), cache_write: int(u.cache_creation_input_tokens), context_pct: contextPct(str(msg.model, ctx.memo.get("model") ?? ""), input, windows), usd: null },
        }),
      );
    }
    if (out.length === 0) out.push(streamEvent(ctx, { kind: "unparsed", child, text: line }));
    return out;
  }
  if (type === "result") {
    const u = obj(j.usage);
    const usd = typeof j.total_cost_usd === "number" && j.total_cost_usd >= 0 ? j.total_cost_usd : null;
    out.push(streamEvent(ctx, { kind: "usage", usage: { input: int(u.input_tokens), output: int(u.output_tokens), cache_read: int(u.cache_read_input_tokens), cache_write: int(u.cache_creation_input_tokens), context_pct: null, usd } }));
    const ok = j.subtype === "success" && j.is_error !== true;
    out.push(streamEvent(ctx, { kind: "result", result: { ok, claimed_done: ok, error: ok ? null : str(j.subtype, "error") } }));
    return out;
  }
  out.push(streamEvent(ctx, { kind: "unparsed", child, text: line }));
  return out;
}
