import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { bootTokenHash, costUsd, createProxyServer, mintBootToken, mintTaskToken, verifyTaskToken } from "./index.js";
import type { RequestLine, TokenClaims } from "./index.js";

// D-392: saved connections (DeepSeek, Kimi, Z.ai, Ollama, a custom endpoint…) are upstreams of the proxy, each with its own
// key, address, auth style and allowed models. A task token names ONE upstream (claim u); the agent still sees mdt_ only.
const secret = randomBytes(32);
const NOW = 1_792_454_400;
const KEY = ["sk", "ds", randomBytes(24).toString("base64url")].join("-");
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});
async function listen(s: http.Server): Promise<string> {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  closers.push(() => new Promise((r) => { s.closeAllConnections(); s.close(() => r()); }));
  return `http://127.0.0.1:${(s.address() as net.AddressInfo).port}`;
}
function call(base: string, p: string, o: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const r = http.request(base + p, { method: o.method ?? "POST", headers: o.headers ?? {} }, (res) => {
      let b = "";
      res.on("data", (c: Buffer) => (b += c.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b }));
    });
    r.on("error", reject);
    r.end(o.body);
  });
}
async function upstream(usage = { input_tokens: 1_000_000, output_tokens: 0 }) {
  const seen: { path: string; headers: http.IncomingHttpHeaders }[] = [];
  const s = http.createServer((req, res) => {
    seen.push({ path: req.url ?? "", headers: req.headers });
    req.resume();
    req.on("end", () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ usage })));
  });
  return { url: await listen(s), seen };
}
async function booted(boot: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), "ups-"));
  const logs: RequestLine[] = [];
  const t = mintBootToken();
  const p = createProxyServer({
    secret, apiKey: "", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, "usage.jsonl"), now: () => NOW * 1000, log: (l) => logs.push(l), allowHttpUpstream: true,
    boot: { tokenHash: bootTokenHash(t), expiresAtMs: (NOW + 60) * 1000, spentFile: path.join(dir, "spent") },
  });
  const inf = await listen(p.inference);
  const adm = await listen(p.admin);
  const b = await call(adm, "/admin/boot", { headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify(boot) });
  return { inf, adm, logs, boot: b.status };
}
const token = (over: Partial<TokenClaims> = {}) => mintTaskToken(secret, { t: "t_x", r: `r_${ulid()}`, a: 1, e: NOW + 600, b: 5, n: "aa", ...over });
const msg = (model: string) => JSON.stringify({ model, max_tokens: 1, messages: [] });
const ups = (url: string, over: Record<string, unknown> = {}) => ({ wire: "anthropic", url, auth: "x-api-key", key: KEY, models: ["deepseek-v4-pro", "glm-5.2[1m]"], prices: { "deepseek-v4-pro": { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1 } }, ...over });

describe("proxy upstreams of saved connections (D-392)", () => {
  it("a token names its upstream (claim u); the verifier keeps it and refuses a bad one", () => {
    const t = token({ u: "deepseek" });
    const v = verifyTaskToken(secret, t, NOW);
    expect(v.ok && v.claims.u).toBe("deepseek");
    expect(verifyTaskToken(secret, token({ u: "Bad Id" as string }), NOW).ok).toBe(false);
  });
  it("boot without an Anthropic key: only upstreams; healthz lists their ids (never keys)", async () => {
    const up = await upstream();
    const p = await booted({ upstreams: { deepseek: ups(`${up.url}/anthropic`) } });
    expect(p.boot).toBe(204);
    const h = await call(p.adm, "/healthz", { method: "GET" });
    expect(JSON.parse(h.body)).toMatchObject({ locked: false, providers: [], upstreams: ["deepseek"] });
    expect(h.body).not.toContain(KEY);
  });
  it("the request goes to the upstream's base path with its key in x-api-key; the agent's token never leaves", async () => {
    const up = await upstream();
    const p = await booted({ upstreams: { deepseek: ups(`${up.url}/anthropic`) } });
    const t = token({ u: "deepseek" });
    const r = await call(p.inf, "/v1/messages", { headers: { "x-api-key": t }, body: msg("deepseek-v4-pro") });
    expect(r.status).toBe(200);
    expect(up.seen[0]?.path).toBe("/anthropic/v1/messages");
    expect(up.seen[0]?.headers["x-api-key"]).toBe(KEY);
    expect(up.seen[0]?.headers.authorization).toBeUndefined();
    expect(JSON.stringify(up.seen)).not.toContain(t);
    expect(p.logs.at(-1)).toMatchObject({ status: 200, model: "deepseek-v4-pro", usd: 1, upstream: "deepseek" });
  });
  it("bearer auth sends Authorization; a local server (auth none) gets no key at all and costs 0", async () => {
    const up = await upstream();
    const p = await booted({ upstreams: { zai: ups(up.url, { auth: "bearer" }), ollama: ups(up.url, { auth: "none", key: "", models: ["qwen3-coder"], prices: { "qwen3-coder": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } }) } });
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": token({ u: "zai" }) }, body: msg("glm-5.2") })).status).toBe(200);
    expect(up.seen[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(up.seen[0]?.headers["x-api-key"]).toBeUndefined();
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": token({ u: "ollama" }) }, body: msg("qwen3-coder") })).status).toBe(200);
    expect(up.seen[1]?.headers.authorization).toBeUndefined();
    expect(up.seen[1]?.headers["x-api-key"]).toBeUndefined();
    expect(p.logs.at(-1)).toMatchObject({ usd: 0 });
  });
  it("a model outside the connection's list → 403; [1m] in the list also allows the bare name; a missing price is estimated", async () => {
    const up = await upstream();
    const p = await booted({ upstreams: { deepseek: ups(up.url) } });
    const r = await call(p.inf, "/v1/messages", { headers: { "x-api-key": token({ u: "deepseek" }) }, body: msg("claude-opus-5-5") });
    expect(r.status).toBe(403);
    expect(r.body).toContain("model_not_allowed");
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": token({ u: "deepseek" }) }, body: msg("glm-5.2") })).status).toBe(200);
    expect(p.logs.at(-1)).toMatchObject({ usd: 2, estimated: true }); // the Sonnet rate: 1M input × $2
  });
  it("an unknown upstream, a wire mismatch or a token without u on a proxy without an Anthropic key → refused", async () => {
    const up = await upstream();
    const p = await booted({ upstreams: { deepseek: ups(up.url) } });
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": token({ u: "kimi" }) }, body: msg("deepseek-v4-pro") })).body).toContain("provider_not_configured");
    expect((await call(p.inf, "/v1/responses", { headers: { authorization: `Bearer ${token({ u: "deepseek" })}` }, body: msg("deepseek-v4-pro") })).status).toBe(401);
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": token() }, body: msg("claude-sonnet-5-5") })).body).toContain("provider_not_configured");
    expect(up.seen).toHaveLength(0);
  });
  it("bad upstreams in the boot payload → 400 (a remote http address, an unknown field, a bad id)", async () => {
    for (const bad of [{ upstreams: { x: ups("http://evil.example") } }, { upstreams: { x: { ...ups("https://a.example"), extra: 1 } } }, { upstreams: { "Bad Id": ups("https://a.example") } }]) {
      const dir = mkdtempSync(path.join(tmpdir(), "ups-"));
      const t = mintBootToken();
      const p = createProxyServer({ secret, apiKey: "", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, "u.jsonl"), now: () => NOW * 1000, log: () => undefined, boot: { tokenHash: bootTokenHash(t), expiresAtMs: (NOW + 60) * 1000, spentFile: path.join(dir, "s") } });
      const adm = await listen(p.admin);
      expect((await call(adm, "/admin/boot", { headers: { authorization: `Bearer ${t}` }, body: JSON.stringify(bad) })).status).toBe(400);
    }
  });
});

describe("Claude models on the Anthropic key (D-392)", () => {
  it("Opus 5.5 and Fable 5.1 have prices now (the task box can pick them)", () => {
    expect(costUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(24);
    expect(costUsd("claude-fable-5-1", { input_tokens: 1_000_000, output_tokens: 0 })).toBe(10);
  });
});
