import type { ResponsesUsage, Usage } from "./pricing.js";

/** Incremental SSE parser that only collects usage (message_start + message_delta). Never buffers the stream. */
export class SseUsage {
  private buf = "";
  readonly usage: Usage = { input_tokens: 0, output_tokens: 0 };
  /** D-422: the reply opened a tool_use block */
  toolUse = false;

  push(chunk: string): void {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf("\n\n")) >= 0) {
      this.event(this.buf.slice(0, i));
      this.buf = this.buf.slice(i + 2);
    }
  }

  end(): void {
    if (this.buf.trim().length > 0) this.event(this.buf);
    this.buf = "";
  }

  private event(block: string): void {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (data.length === 0) return;
    let j: { type?: string; message?: { usage?: Partial<Usage> }; usage?: Partial<Usage>; content_block?: { type?: unknown } };
    try {
      j = JSON.parse(data) as typeof j;
    } catch {
      return;
    }
    if (j.type === "content_block_start" && isToolBlock(j.content_block?.type)) this.toolUse = true;
    const u = j.type === "message_start" ? j.message?.usage : j.type === "message_delta" ? j.usage : undefined;
    if (!u) return;
    mergeUsage(this.usage, u);
  }
}

/** D-422: tool_use / server_tool_use (Messages API); function_call, custom_tool_call, local_shell_call… (Responses API). */
const isToolBlock = (t: unknown): boolean => typeof t === "string" && /tool_use$/.test(t);
const isToolItem = (t: unknown): boolean => typeof t === "string" && /_call$/.test(t);

/** D-422: did a non-streamed reply call a tool? (Messages: content[].type; Responses: output[].type) */
export function repliedWithTool(j: unknown): boolean {
  const o = (j ?? {}) as { content?: unknown; output?: unknown };
  if (Array.isArray(o.content)) return o.content.some((b) => isToolBlock((b as { type?: unknown } | null)?.type));
  if (Array.isArray(o.output)) return o.output.some((b) => isToolItem((b as { type?: unknown } | null)?.type));
  return false;
}

export function mergeUsage(into: Usage, u: Partial<Usage>): void {
  if (typeof u.input_tokens === "number") into.input_tokens = u.input_tokens;
  if (typeof u.output_tokens === "number") into.output_tokens = u.output_tokens;
  if (typeof u.cache_creation_input_tokens === "number") into.cache_creation_input_tokens = u.cache_creation_input_tokens;
  if (typeof u.cache_read_input_tokens === "number") into.cache_read_input_tokens = u.cache_read_input_tokens;
  if (u.cache_creation) into.cache_creation = { ...u.cache_creation };
}

/** E3в: usage of the Responses API — `response.completed` SSE event (or the plain JSON body). */
export function responsesUsageOf(j: unknown): ResponsesUsage | null {
  const o = (j ?? {}) as { type?: string; response?: { usage?: unknown }; usage?: unknown };
  const u = (o.type === "response.completed" ? o.response?.usage : (o.usage ?? o.response?.usage)) as
    | { input_tokens?: unknown; output_tokens?: unknown; input_tokens_details?: { cached_tokens?: unknown }; output_tokens_details?: { reasoning_tokens?: unknown } }
    | undefined;
  if (!u || typeof u.input_tokens !== "number" || typeof u.output_tokens !== "number") return null;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  return { input_tokens: u.input_tokens, output_tokens: u.output_tokens, cached_tokens: num(u.input_tokens_details?.cached_tokens), reasoning_tokens: num(u.output_tokens_details?.reasoning_tokens) };
}

export class SseResponsesUsage {
  private buf = "";
  usage: ResponsesUsage | null = null;
  /** D-422: an output item was a tool call */
  toolUse = false;
  push(chunk: string): void {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf("\n\n")) >= 0) {
      this.event(this.buf.slice(0, i));
      this.buf = this.buf.slice(i + 2);
    }
  }
  end(): void {
    if (this.buf.trim().length > 0) this.event(this.buf);
    this.buf = "";
  }
  private event(block: string): void {
    const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
    if (data.length === 0) return;
    try {
      const j = JSON.parse(data) as { type?: string; item?: { type?: unknown } };
      if (j.type === "response.output_item.added" && isToolItem(j.item?.type)) this.toolUse = true;
      const u = responsesUsageOf(j);
      if (u) this.usage = u;
    } catch {
      return;
    }
  }
}

/** D-424: the Gemini API's usageMetadata → Usage (fresh input, cached input, output incl. thoughts); null = none. */
export function geminiUsageOf(j: unknown): Usage | null {
  const m = ((j ?? {}) as { usageMetadata?: Record<string, unknown> }).usageMetadata;
  if (!m || typeof m.promptTokenCount !== "number") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const cached = n(m.cachedContentTokenCount);
  return { input_tokens: Math.max(0, m.promptTokenCount - cached), cache_read_input_tokens: cached, output_tokens: n(m.candidatesTokenCount) + n(m.thoughtsTokenCount) };
}
/** D-424: did a Gemini reply call a function (candidates[].content.parts[].functionCall)? */
export function geminiToolUse(j: unknown): boolean {
  const cs = ((j ?? {}) as { candidates?: unknown }).candidates;
  return Array.isArray(cs) && cs.some((c) => {
    const parts = ((c as { content?: { parts?: unknown } } | null)?.content?.parts);
    return Array.isArray(parts) && parts.some((p) => (p as { functionCall?: unknown } | null)?.functionCall != null);
  });
}

/** D-424: `streamGenerateContent?alt=sse` — every chunk may carry usageMetadata; the last one is the total. */
export class SseGeminiUsage {
  private buf = "";
  usage: Usage | null = null;
  toolUse = false;
  push(chunk: string): void {
    this.buf += chunk.replace(/\r\n/g, "\n");
    let i: number;
    while ((i = this.buf.indexOf("\n\n")) >= 0) {
      this.event(this.buf.slice(0, i));
      this.buf = this.buf.slice(i + 2);
    }
  }
  end(): void {
    if (this.buf.trim().length > 0) this.event(this.buf);
    this.buf = "";
  }
  private event(block: string): void {
    const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
    if (data.length === 0) return;
    try {
      const j: unknown = JSON.parse(data);
      const u = geminiUsageOf(j);
      if (u) this.usage = u;
      if (geminiToolUse(j)) this.toolUse = true;
    } catch {
      return;
    }
  }
}
