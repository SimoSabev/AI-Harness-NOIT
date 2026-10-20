import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { costUsdOpenAi, createProxyServer, limitOf, mintTaskToken } from "./index.js";
import type { TokenClaims } from "./index.js";

// Демо промпт т. 8.3: proxy-responses (stub; token of another channel → 401; Upgrade → 403) + limits (Ф3 П6).
// The SSE recording is synthetic until the S-CX spike (D-288): fixtures/openai-sse/responses.sse.
const secret = randomBytes(32);
const NOW = 1_792_454_400;
const OPENAI_KEY = ["sk", "proj", randomBytes(24).toString("base64url")].join("-");
const ANTH_KEY = ["sk", "ant", "api03", randomBytes(30).toString("base64url")].join("-");
const PRICES = { "gpt-5-codex": { input: 1.25, cached_input: 0.125, output: 10 } };
const SSE = readFileSync(new URL("../../../fixtures/openai-sse/responses.sse", import.meta.url), "utf8");
const claims = (over: Partial<TokenClaims> = {}): TokenClaims => ({ t: "t_x", r: "r_" + ulid(), a: 1, e: NOW + 3600, b: 2, n: randomBytes(8).toString("hex"), ...over });

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});
async function listen(s: http.Server): Promise<string> {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  closers.push(() => new Promise((r) => { s.closeAllConnections(); s.close(() => r()); }));
  return `http://127.0.0.1:${(s.address() as net.AddressInfo).port}`;
}
async function upstream(answer: (path: string) => { status: number; headers: Record<string, string>; body: string }) {
  const seen: { headers: http.IncomingHttpHeaders; path: string }[] = [];
  const s = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      seen.push({ headers: req.headers, path: req.url ?? "" });
      const a = answer(req.url ?? "");
      res.writeHead(a.status, a.headers);
      res.end(a.body);
    });
  });
  return { url: await listen(s), seen };
}
function call(base: string, p: string, o: { headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const r = http.request(base + p, { method: "POST", headers: o.headers ?? {} }, (res) => {
      let b = "";
      res.on("data", (c: Buffer) => (b += c.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b }));
    });
    r.on("error", reject);
    r.end(o.body);
  });
}
async function setup(answer: Parameters<typeof upstream>[0]) {
  const up = await upstream(answer);
  const p = createProxyServer({ secret, apiKey: ANTH_KEY, upstream: up.url, usageLogPath: path.join(mkdtempSync(path.join(tmpdir(), "px-")), "u.jsonl"), now: () => NOW * 1000, log: () => undefined, openai: { apiKey: OPENAI_KEY, upstream: up.url, prices: PRICES } });
  return { up, inf: await listen(p.inference), state: p.state };
}
const body = (model = "gpt-5-codex") => JSON.stringify({ model, input: "hi", stream: true });

describe("proxy /v1/responses (E3в)", () => {
  it("openai токен → upstream с истинския ключ (Bearer), usage от response.completed, цена", async () => {
    const s = await setup(() => ({ status: 200, headers: { "content-type": "text/event-stream" }, body: SSE }));
    const c = claims({ p: "openai" });
    const r = await call(s.inf, "/v1/responses", { headers: { authorization: `Bearer ${mintTaskToken(secret, c)}`, "content-type": "application/json" }, body: body() });
    expect(r.status).toBe(200);
    expect(r.body).toContain("response.completed");
    expect(s.up.seen[0]?.headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
    expect(s.up.seen[0]?.headers["x-api-key"]).toBeUndefined();
    const u = s.state.usage(c.r);
    expect([u.inputTokens, u.outputTokens, u.cacheReadTokens, u.requests]).toEqual([1000, 200, 400, 1]);
    expect(u.usd).toBeCloseTo(costUsdOpenAi(PRICES["gpt-5-codex"], { input_tokens: 1000, cached_tokens: 400, output_tokens: 200, reasoning_tokens: 50 }), 12);
    expect(u.usd).toBeCloseTo((600 * 1.25 + 400 * 0.125 + 200 * 10) / 1e6, 12);
  });
  it("токен на друг канал → 401 (и обратно); модел без цена → 403; Upgrade → 403", async () => {
    const s = await setup(() => ({ status: 200, headers: { "content-type": "application/json" }, body: "{}" }));
    const anth = mintTaskToken(secret, claims());
    const oai = mintTaskToken(secret, claims({ p: "openai" }));
    expect((await call(s.inf, "/v1/responses", { headers: { authorization: `Bearer ${anth}` }, body: body() })).status).toBe(401);
    expect((await call(s.inf, "/v1/messages", { headers: { "x-api-key": oai }, body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1, messages: [] }) })).status).toBe(401);
    const noPrice = await call(s.inf, "/v1/responses", { headers: { authorization: `Bearer ${oai}` }, body: body("gpt-unknown") });
    expect([noPrice.status, noPrice.body]).toEqual([403, JSON.stringify({ type: "error", error: { type: "permission_error", message: "mandat: model_not_allowed" } })]);
    expect((await call(s.inf, "/v1/responses", { headers: { authorization: `Bearer ${oai}`, connection: "Upgrade", upgrade: "websocket" }, body: body() })).status).toBe(403);
    expect(s.up.seen).toHaveLength(0);
  });
  it("без openai конфигурация → 403 provider_not_configured", async () => {
    const up = await upstream(() => ({ status: 200, headers: {}, body: "{}" }));
    const p = createProxyServer({ secret, apiKey: ANTH_KEY, upstream: up.url, usageLogPath: path.join(mkdtempSync(path.join(tmpdir(), "px-")), "u.jsonl"), now: () => NOW * 1000, log: () => undefined });
    const inf = await listen(p.inference);
    const r = await call(inf, "/v1/responses", { headers: { authorization: `Bearer ${mintTaskToken(secret, claims({ p: "openai" }))}` }, body: body() });
    expect(r.body).toContain("provider_not_configured");
  });
  it("429 на Anthropic → limit {retry_after_s, resets_at} в usage на опита", async () => {
    const s = await setup(() => ({ status: 429, headers: { "content-type": "application/json", "retry-after": "7200", "anthropic-ratelimit-requests-reset": "2026-10-20T14:00:00Z" }, body: JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "x" } }) }));
    const c = claims();
    const r = await call(s.inf, "/v1/messages", { headers: { "x-api-key": mintTaskToken(secret, c) }, body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1, messages: [] }) });
    expect(r.status).toBe(429);
    expect(s.state.usage(c.r).limit).toEqual({ retry_after_s: 7200, resets_at: "2026-10-20T14:00:00.000Z", at: new Date(NOW * 1000).toISOString() });
    expect(s.state.usage(c.r).usd).toBe(0);
  });
  it("limitOf: retry-after в секунди/дата; reset като epoch, ISO, продължителност", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(limitOf({ "retry-after": "30" }, now)).toEqual({ retry_after_s: 30, resets_at: "2026-10-20T12:00:30.000Z" });
    expect(limitOf({ "retry-after": "Tue, 20 Oct 2026 12:05:00 GMT" }, now).retry_after_s).toBe(300);
    expect(limitOf({ "anthropic-ratelimit-unified-reset": "1792504800" }, now).resets_at).toBe("2026-10-20T14:00:00.000Z");
    expect(limitOf({ "x-ratelimit-reset-requests": "6m0s" }, now).resets_at).toBe("2026-10-20T12:06:00.000Z");
    expect(limitOf({}, now)).toEqual({ retry_after_s: null, resets_at: null });
  });
});
