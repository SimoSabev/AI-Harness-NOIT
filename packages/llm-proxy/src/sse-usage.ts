import type { ResponsesUsage, Usage } from "./pricing.js";

/** Incremental SSE parser that only collects usage (message_start + message_delta). Never buffers the stream. */
export class SseUsage {
  private buf = "";
  readonly usage: Usage = { input_tokens: 0, output_tokens: 0 };

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
    let j: { type?: string; message?: { usage?: Partial<Usage> }; usage?: Partial<Usage> };
    try {
      j = JSON.parse(data) as typeof j;
    } catch {
      return;
    }
    const u = j.type === "message_start" ? j.message?.usage : j.type === "message_delta" ? j.usage : undefined;
    if (!u) return;
    mergeUsage(this.usage, u);
  }
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
      const u = responsesUsageOf(JSON.parse(data));
      if (u) this.usage = u;
    } catch {
      return;
    }
  }
}
