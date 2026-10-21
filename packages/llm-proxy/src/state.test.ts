import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProxyState } from "./state.js";
import type { RequestLine } from "./state.js";

const line = (status: number, run = "r1"): RequestLine => ({ kind: "request", ts: "2026-10-21T00:00:00.000Z", run_id: run, method: "POST", path: "/v1/messages", status, model: null, input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0, usd: 0, token_prefix8: null });

// D-293: an upstream 401/403 (the provider rejected the key) is kept per run, so the task can say so.
describe("ProxyState.authFailed (D-293)", () => {
  it("401/403 → authFailed; 200/429 alone → not; survives a restart (usage.jsonl)", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "mandat-state-")), "usage.jsonl");
    const s = new ProxyState(file);
    s.record(line(200));
    s.record(line(429));
    expect(s.usage("r1").authFailed).toBe(false);
    s.record(line(401));
    expect(s.usage("r1").authFailed).toBe(true);
    s.record(line(403, "r2"));
    expect(s.usage("r2").authFailed).toBe(true);
    expect(s.usage("nope").authFailed).toBe(false);
    expect(new ProxyState(file).usage("r1").authFailed).toBe(true);
  });
});
