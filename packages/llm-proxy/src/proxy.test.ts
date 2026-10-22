import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { SseUsage, adminBearer, costUsd, createProxyServer, mintTaskToken, verifyTaskToken } from "./index.js";
import type { RequestLine, TokenClaims } from "./index.js";

const secret = randomBytes(32);
const NOW = 1_792_454_400;
const claims = (over: Partial<TokenClaims> = {}): TokenClaims => ({ t: "t_fix_discount", r: "r_" + ulid(), a: 1, e: NOW + 3600, b: 2, n: randomBytes(8).toString("hex"), ...over });
// D-095: the "real" key is assembled at runtime, never a literal.
const REAL_KEY = ["sk", "ant", "api03", randomBytes(30).toString("base64url")].join("-");

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});
async function listen(s: http.Server): Promise<string> {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  closers.push(() => new Promise((r) => { s.closeAllConnections(); s.close(() => r()); }));
  return `http://127.0.0.1:${(s.address() as net.AddressInfo).port}`;
}

type Up = { status?: number; headers?: Record<string, string>; body?: string; sse?: unknown[] };
async function upstream(answer: () => Up) {
  const seen: { headers: http.IncomingHttpHeaders; body: string; path: string }[] = [];
  const s = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c: Buffer) => (b += c.toString()));
    req.on("end", () => {
      seen.push({ headers: req.headers, body: b, path: req.url ?? "" });
      const a = answer();
      if (a.sse) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        for (const e of a.sse) res.write(`event: x\ndata: ${JSON.stringify(e)}\n\n`);
        res.end();
      } else {
        res.writeHead(a.status ?? 200, { "content-type": "application/json", ...(a.headers ?? {}) });
        res.end(a.body ?? "{}");
      }
    });
  });
  return { url: await listen(s), seen };
}

async function proxy(up: string, usageLogPath = path.join(mkdtempSync(path.join(tmpdir(), "mandat-proxy-")), "usage.jsonl")) {
  const logs: RequestLine[] = [];
  const out: string[] = [];
  const p = createProxyServer({ secret, apiKey: REAL_KEY, upstream: up, usageLogPath, now: () => NOW * 1000, log: (l) => { logs.push(l); out.push(JSON.stringify(l)); } });
  return { inf: await listen(p.inference), adm: await listen(p.admin), logs, out, usageLogPath };
}

function call(base: string, p: string, o: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const r = http.request(base + p, { method: o.method ?? "POST", headers: o.headers ?? {} }, (res) => {
      let b = "";
      res.on("data", (c: Buffer) => (b += c.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b, headers: res.headers }));
    });
    r.on("error", reject);
    r.end(o.body);
  });
}
const msg = (model = "claude-sonnet-5-5") => JSON.stringify({ model, max_tokens: 10, messages: [] });
const SSE_7200 = [
  { type: "message_start", message: { usage: { input_tokens: 1000, cache_read_input_tokens: 2000, output_tokens: 0 } } },
  { type: "message_delta", usage: { output_tokens: 500 } },
  { type: "message_stop" },
];

describe("token", () => {
  it("token roundtrip, подпис, изтичане", () => {
    const c = claims();
    const t = mintTaskToken(secret, c);
    expect(t.startsWith("mdt_")).toBe(true);
    expect(verifyTaskToken(secret, t, NOW)).toEqual({ ok: true, claims: c });
    const last = t.at(-2) === "A" ? "B" : "A";
    expect(verifyTaskToken(secret, t.slice(0, -2) + last + t.slice(-1), NOW)).toEqual({ ok: false, code: "token_invalid" });
    expect(verifyTaskToken(secret, mintTaskToken(secret, claims({ e: NOW - 1 })), NOW)).toEqual({ ok: false, code: "token_expired" });
    expect(verifyTaskToken(randomBytes(32), t, NOW).ok).toBe(false);
    expect(verifyTaskToken(secret, "sk-ant-x", NOW).ok).toBe(false);
    expect(adminBearer(secret)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("costUsd", () => {
  it("sonnet SSE пример, кеш разбивка (D-068), haiku > 100k, непознат", () => {
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 1000, cache_read_input_tokens: 2000, output_tokens: 500 })).toBeCloseTo(0.0072, 10);
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 3000, cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 } })).toBeCloseTo(0.0105, 10);
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000 })).toBeCloseTo(0.0025, 10);
    expect(costUsd("claude-haiku-5-5", { input_tokens: 120000, output_tokens: 0 })).toBeCloseTo(0.06, 10);
    expect(costUsd("claude-haiku-5-5", { input_tokens: 100000, output_tokens: 0 })).toBeCloseTo(0.01, 10);
    expect(costUsd("gpt-4", { input_tokens: 1, output_tokens: 1 })).toBeNull();
  });
  it("SseUsage събира само usage", () => {
    const p = new SseUsage();
    const text = SSE_7200.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join("") + "event: ping\ndata: {\"type\":\"ping\"}\n\ndata: not json\n\n";
    for (let i = 0; i < text.length; i += 7) p.push(text.slice(i, i + 7));
    p.end();
    expect(p.usage).toMatchObject({ input_tokens: 1000, cache_read_input_tokens: 2000, output_tokens: 500 });
  });
});

describe("proxy server", () => {
  it("ключът се подменя; броене от SSE", async () => {
    const up = await upstream(() => ({ sse: SSE_7200 }));
    const p = await proxy(up.url);
    const c = claims();
    const tok = mintTaskToken(secret, c);
    const r = await call(p.inf, "/v1/messages?beta=true", { headers: { "x-api-key": tok, "anthropic-version": "2023-06-01" }, body: msg() });
    expect(r.status).toBe(200);
    expect(up.seen[0]?.headers["x-api-key"]).toBe(REAL_KEY);
    expect(JSON.stringify(up.seen[0]?.headers)).not.toContain("mdt_");
    expect(up.seen[0]?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(up.seen[0]?.path).toBe("/v1/messages?beta=true");
    const u = JSON.parse((await call(p.adm, `/admin/usage?run_id=${c.r}`, { method: "GET", headers: { authorization: `Bearer ${adminBearer(secret)}` } })).body) as { usd: number; requests: number; inputTokens: number };
    expect(u.usd).toBeCloseTo(0.0072, 10);
    expect(u.requests).toBe(1);
    expect(u.inputTokens).toBe(1000);
  });

  it("Bearer се приема", async () => {
    const up = await upstream(() => ({ sse: SSE_7200 }));
    const p = await proxy(up.url);
    const r = await call(p.inf, "/v1/messages", { headers: { authorization: `Bearer ${mintTaskToken(secret, claims())}` }, body: msg() });
    expect(r.status).toBe(200);
  });

  it("revoked; admin без bearer; healthz", async () => {
    const up = await upstream(() => ({ sse: SSE_7200 }));
    const p = await proxy(up.url);
    const c = claims();
    expect((await call(p.adm, "/admin/revoke", { body: JSON.stringify({ run_id: c.r }) })).status).toBe(401);
    expect((await call(p.adm, "/admin/revoke", { headers: { authorization: `Bearer ${adminBearer(secret)}` }, body: JSON.stringify({ run_id: c.r }) })).status).toBe(204);
    expect((await call(p.adm, "/admin/revoke", { headers: { authorization: `Bearer ${adminBearer(secret)}` }, body: "x" })).status).toBe(400);
    const r = await call(p.inf, "/v1/messages", { headers: { "x-api-key": mintTaskToken(secret, c) }, body: msg() });
    expect(r.status).toBe(401);
    expect(JSON.parse(r.body)).toEqual({ type: "error", error: { type: "authentication_error", message: "mandat: token_revoked" } });
    expect(JSON.parse((await call(p.adm, "/healthz", { method: "GET" })).body)).toEqual({ ok: true, version: "0.1.0", locked: false, providers: ["anthropic"] });
    expect((await call(p.adm, "/nope", { method: "GET", headers: { authorization: `Bearer ${adminBearer(secret)}` } })).status).toBe(404);
    expect(up.seen).toHaveLength(0);
  });

  it("непознат модел, грешен път, без токен, невалиден токен", async () => {
    const up = await upstream(() => ({ sse: SSE_7200 }));
    const p = await proxy(up.url);
    const tok = mintTaskToken(secret, claims());
    const m = await call(p.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: msg("gpt-4") });
    expect(m.status).toBe(403);
    expect(m.body).toContain("mandat: model_not_allowed");
    expect((await call(p.inf, "/v1/models", { method: "GET", headers: { "x-api-key": tok } })).body).toContain("path_not_allowed");
    expect((await call(p.inf, "/v1/messages", { body: msg() })).status).toBe(401);
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": "mdt_bad.x" }, body: msg() })).body).toContain("token_invalid");
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: "not json" })).body).toContain("model_not_allowed");
    expect(up.seen).toHaveLength(0);
  });

  it("бюджет (D-089)", async () => {
    const up = await upstream(() => ({ sse: SSE_7200 }));
    const p = await proxy(up.url);
    const c = claims({ b: 0.01 });
    const tok = mintTaskToken(secret, c);
    const usage = async () => JSON.parse((await call(p.adm, `/admin/usage?run_id=${c.r}`, { method: "GET", headers: { authorization: `Bearer ${adminBearer(secret)}` } })).body) as { budgetStop: boolean };
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: msg() })).status).toBe(200);
    expect((await usage()).budgetStop).toBe(false);
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: msg() })).status).toBe(200);
    expect((await usage()).budgetStop).toBe(true);
    const third = await call(p.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: msg() });
    expect(third.status).toBe(403);
    expect(third.headers["x-should-retry"]).toBe("false");
    expect(third.body).toContain("budget_exhausted");
    expect(up.seen).toHaveLength(2);
  });

  it("грешките на upstream минават непроменени; upstream недостъпен → 502", async () => {
    const up = await upstream(() => ({ status: 429, headers: { "retry-after": "7" }, body: "X" }));
    const p = await proxy(up.url);
    const tok = mintTaskToken(secret, claims());
    const r = await call(p.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: msg() });
    expect([r.status, r.headers["retry-after"], r.body]).toEqual([429, "7", "X"]);
    const dead = await proxy("http://127.0.0.1:1");
    const d = await call(dead.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: msg() });
    expect(d.status).toBe(502);
    expect(d.body).toContain("upstream_unreachable");
  });

  it("проксито не логва тайни", async () => {
    const up = await upstream(() => ({ sse: SSE_7200 }));
    const p = await proxy(up.url);
    const tok = mintTaskToken(secret, claims());
    await call(p.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: msg() });
    await call(p.inf, "/v1/messages", { headers: { "x-api-key": "mdt_bad.x" }, body: msg() });
    const all = p.out.join("\n") + readFileSync(p.usageLogPath, "utf8");
    expect(all).not.toContain(REAL_KEY);
    expect(all).not.toContain(tok);
    expect(all).not.toContain("mdt_bad");
    expect(p.logs[0]?.token_prefix8).toMatch(/^[0-9a-f]{8}$/);
  });

  it("рестарт пази spent и revoked (D-116)", async () => {
    const up = await upstream(() => ({ sse: SSE_7200 }));
    const p1 = await proxy(up.url);
    const a = claims();
    const b = claims();
    await call(p1.inf, "/v1/messages", { headers: { "x-api-key": mintTaskToken(secret, a) }, body: msg() });
    await call(p1.adm, "/admin/revoke", { headers: { authorization: `Bearer ${adminBearer(secret)}` }, body: JSON.stringify({ run_id: b.r }) });
    writeFileSync(p1.usageLogPath, readFileSync(p1.usageLogPath, "utf8") + "garbage\n");
    const p2 = await proxy(up.url, p1.usageLogPath);
    const u = JSON.parse((await call(p2.adm, `/admin/usage?run_id=${a.r}`, { method: "GET", headers: { authorization: `Bearer ${adminBearer(secret)}` } })).body) as { usd: number; requests: number };
    expect(u.usd).toBeCloseTo(0.0072, 10);
    expect(u.requests).toBe(1);
    expect((await call(p2.inf, "/v1/messages", { headers: { "x-api-key": mintTaskToken(secret, b) }, body: msg() })).body).toContain("token_revoked");
  });

  it("count_tokens и не-SSE (D-116)", async () => {
    const up = await upstream(() => ({ body: JSON.stringify({ usage: { input_tokens: 1000, output_tokens: 500 } }) }));
    const p = await proxy(up.url);
    const c = claims();
    const tok = mintTaskToken(secret, c);
    const get = async () => JSON.parse((await call(p.adm, `/admin/usage?run_id=${c.r}`, { method: "GET", headers: { authorization: `Bearer ${adminBearer(secret)}` } })).body) as { usd: number; requests: number };
    expect((await call(p.inf, "/v1/messages/count_tokens", { headers: { "x-api-key": tok }, body: msg() })).status).toBe(200);
    expect(await get()).toMatchObject({ usd: 0, requests: 1 });
    await call(p.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: msg() });
    const u = await get();
    expect(u.usd).toBeCloseTo(0.007, 10);
    expect(u.requests).toBe(2);
  });
});
