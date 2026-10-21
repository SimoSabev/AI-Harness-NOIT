import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";

export interface RunUsage {
  usd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  requests: number;
  budget: number | null;
  /** E3в: the last upstream 429 of this run (Ф3 П6) */
  limit: Limit | null;
  /** D-293: the provider answered 401/403 — the key was rejected */
  authFailed: boolean;
}
export interface Limit { retry_after_s: number | null; resets_at: string | null; at: string }
export interface TaskUsage {
  usd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  requests: number;
  budgetStop: boolean;
  limit: Limit | null;
  authFailed: boolean;
}
export interface RequestLine {
  kind: "request";
  ts: string;
  run_id: string | null;
  method: string;
  path: string;
  status: number;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  usd: number;
  token_prefix8: string | null;
  provider?: "anthropic" | "openai";
  limit?: Omit<Limit, "at">;
}
export interface RevokeLine {
  kind: "revoke";
  ts: string;
  run_id: string;
}

const empty = (): RunUsage => ({ usd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0, budget: null, limit: null, authFailed: false });

/** D-116: usage.jsonl is the durable state; it is replayed on start so restarts keep spent and revoked. */
export class ProxyState {
  readonly runs = new Map<string, RunUsage>();
  readonly revoked = new Set<string>();

  constructor(private readonly file: string, warn: (msg: string) => void = () => undefined) {
    if (!existsSync(file)) return;
    let bad = 0;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try {
        const j = JSON.parse(line) as RequestLine | RevokeLine;
        if (j.kind === "revoke" && typeof j.run_id === "string") this.revoked.add(j.run_id);
        else if (j.kind === "request") this.apply(j);
        else bad++;
      } catch {
        bad++;
      }
    }
    if (bad > 0) warn(`usage.jsonl: skipped ${bad} invalid line(s)`);
  }

  get(runId: string): RunUsage {
    let u = this.runs.get(runId);
    if (!u) {
      u = empty();
      this.runs.set(runId, u);
    }
    return u;
  }

  private apply(j: RequestLine): void {
    if (j.run_id === null) return;
    const u = this.get(j.run_id);
    u.usd += j.usd;
    u.inputTokens += j.input_tokens;
    u.outputTokens += j.output_tokens;
    u.cacheReadTokens += j.cache_read;
    u.cacheWriteTokens += j.cache_write;
    u.requests += 1;
    if (j.status === 401 || j.status === 403) u.authFailed = true;
    if (j.status === 429) u.limit = { retry_after_s: j.limit?.retry_after_s ?? null, resets_at: j.limit?.resets_at ?? null, at: j.ts };
  }

  record(j: RequestLine): void {
    this.apply(j);
    this.append(j);
  }

  revoke(runId: string): void {
    this.revoked.add(runId);
    this.append({ kind: "revoke", ts: new Date().toISOString(), run_id: runId });
  }

  usage(runId: string): TaskUsage {
    const u = this.runs.get(runId) ?? empty();
    return {
      usd: u.usd,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadTokens: u.cacheReadTokens,
      cacheWriteTokens: u.cacheWriteTokens,
      requests: u.requests,
      budgetStop: u.budget !== null && u.usd >= u.budget,
      limit: u.limit,
      authFailed: u.authFailed,
    };
  }

  private append(j: RequestLine | RevokeLine): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const fd = openSync(this.file, "a");
    try {
      writeSync(fd, JSON.stringify(j) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
