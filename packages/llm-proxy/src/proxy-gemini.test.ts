import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { bootTokenHash, createProxyServer, geminiUsageOf, mintBootToken, mintTaskToken, verifyTaskToken } from "./index.js";
import type { RequestLine, TokenClaims } from "./index.js";

// E9в (spec 5.3, D-424): Gemini CLI with an API key — the agent sends its mdt_ token as x-goog-api-key to
// /v1beta/models/<model>:{generateContent,streamGenerateContent,countTokens}; the proxy swaps it for the real key of a
// `gemini` upstream (boot payload) and counts usageMetadata. The real key never reaches the sandbox.
const secret = randomBytes(32);
const NOW = 1_792_454_400;
const KEY = ["AIza", randomBytes(24).toString("base64url")].join("");
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
const usageMetadata = { promptTokenCount: 1_000_000, cachedContentTokenCount: 400_000, candidatesTokenCount: 100_000, thoughtsTokenCount: 100_000, totalTokenCount: 1_200_000 };
async function upstream() {
  const seen: { path: string; key: string | undefined; auth: string | undefined }[] = [];
  const s = http.createServer((req, res) => {
    seen.push({ path: req.url ?? "", key: req.headers["x-goog-api-key"] as string | undefined, auth: req.headers.authorization });
    req.resume();
    req.on("end", () => {
      if ((req.url ?? "").includes("alt=sse")) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "hi" }] } }], usageMetadata: { promptTokenCount: 10 } })}\r\n\r\n`);
        res.end(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "run_shell_command", args: {} } }] } }], usageMetadata })}\r\n\r\n`);
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify((req.url ?? "").includes(":countTokens") ? { totalTokens: 42 } : { candidates: [], usageMetadata }));
    });
  });
  return { url: await listen(s), seen };
}
async function booted(up: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "gem-"));
  const logs: RequestLine[] = [];
  const bt = mintBootToken();
  const p = createProxyServer({
    secret, apiKey: "", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, "usage.jsonl"), now: () => NOW * 1000, log: (l) => logs.push(l), allowHttpUpstream: true,
    boot: { tokenHash: bootTokenHash(bt), expiresAtMs: (NOW + 60) * 1000, spentFile: path.join(dir, "spent") },
  });
  const inf = await listen(p.inference);
  const adm = await listen(p.admin);
  const g = { wire: "gemini", url: up, auth: "x-goog-api-key", key: KEY, models: ["gemini-2.5-pro"], prices: { "gemini-2.5-pro": { input: 1, output: 10, cacheRead: 0.1, cacheWrite: 1 } } };
  const b = await call(adm, "/admin/boot", { headers: { authorization: `Bearer ${bt}`, "content-type": "application/json" }, body: JSON.stringify({ upstreams: { gemini: g } }) });
  expect(b.status).toBe(204);
  return { inf, logs, state: p.state };
}
const token = (over: Partial<TokenClaims> = {}) => mintTaskToken(secret, { t: "t_x", r: `r_${ulid()}`, a: 1, e: NOW + 600, b: 50, n: "aa", p: "gemini", u: "gemini", ...over });
const gen = (inf: string, tok: string, p: string) => call(inf, p, { headers: { "x-goog-api-key": tok, "content-type": "application/json" }, body: JSON.stringify({ contents: [], tools: [{ functionDeclarations: [] }] }) });

describe("Gemini wire through the proxy (D-424)", () => {
  it("a gemini token verifies; the usage of a reply is read from usageMetadata", () => {
    const v = verifyTaskToken(secret, token(), NOW);
    expect(v.ok && v.claims.p).toBe("gemini");
    expect(geminiUsageOf({ usageMetadata })).toEqual({ input_tokens: 600_000, cache_read_input_tokens: 400_000, output_tokens: 200_000 });
    expect(geminiUsageOf({})).toBe(null);
  });
  it("generateContent: the real key goes up in x-goog-api-key, the mdt_ token never does; priced from the upstream", async () => {
    const up = await upstream();
    const p = await booted(up.url);
    const tok = token();
    const r = await gen(p.inf, tok, "/v1beta/models/gemini-2.5-pro:generateContent");
    expect(r.status).toBe(200);
    expect(up.seen).toEqual([{ path: "/v1beta/models/gemini-2.5-pro:generateContent", key: KEY, auth: undefined }]);
    expect(JSON.stringify(up.seen)).not.toContain("mdt_");
    // 0.6 M input × $1 + 0.4 M cached × $0.1 + 0.2 M output × $10 = 0.6 + 0.04 + 2 = 2.64
    expect(p.logs[0]).toMatchObject({ provider: "gemini", model: "gemini-2.5-pro", upstream: "gemini", input_tokens: 600_000, output_tokens: 200_000, cache_read: 400_000, usd: 2.64 });
  });
  it("streamGenerateContent?alt=sse: usage from the last chunk; countTokens costs nothing", async () => {
    const up = await upstream();
    const p = await booted(up.url);
    const tok = token();
    expect((await gen(p.inf, tok, "/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse")).status).toBe(200);
    expect((await gen(p.inf, tok, "/v1beta/models/gemini-2.5-pro:countTokens")).status).toBe(200);
    expect(p.logs.map((l) => [l.path, l.usd])).toEqual([["/v1beta/models/gemini-2.5-pro:streamGenerateContent", 2.64], ["/v1beta/models/gemini-2.5-pro:countTokens", 0]]);
    expect(up.seen[0]?.path).toBe("/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse");
  });
  it("refused: another model, another method, another query, an anthropic token, a gemini token on /v1/messages", async () => {
    const up = await upstream();
    const p = await booted(up.url);
    const tok = token();
    expect((await gen(p.inf, tok, "/v1beta/models/gemini-3-ultra:generateContent")).status).toBe(403);
    expect((await gen(p.inf, tok, "/v1beta/models/gemini-2.5-pro:embedContent")).status).toBe(403);
    expect((await gen(p.inf, tok, "/v1beta/models/gemini-2.5-pro:generateContent?key=x")).status).toBe(403);
    expect((await gen(p.inf, tok, "/v1beta/files")).status).toBe(403);
    const anthropicTok = mintTaskToken(secret, { t: "t_x", r: `r_${ulid()}`, a: 1, e: NOW + 600, b: 50, n: "aa", u: "gemini" });
    expect((await gen(p.inf, anthropicTok, "/v1beta/models/gemini-2.5-pro:generateContent")).status).toBe(401);
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": tok }, body: JSON.stringify({ model: "gemini-2.5-pro" }) })).status).toBe(401);
    expect(up.seen).toEqual([]);
  });
  it("tests only (allowHttpUpstream): a plain http upstream on a container name boots; without the flag it is refused", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gem-"));
    const boot = async (allowHttpUpstream: boolean) => {
      const bt = mintBootToken();
      const p = createProxyServer({ secret, apiKey: "", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, `u${allowHttpUpstream}.jsonl`), now: () => NOW * 1000, log: () => undefined, allowHttpUpstream, boot: { tokenHash: bootTokenHash(bt), expiresAtMs: (NOW + 60) * 1000, spentFile: path.join(dir, `s${allowHttpUpstream}`) } });
      const adm = await listen(p.admin);
      const g = { wire: "gemini", url: "http://mandat-test-stub-ab12:9000", auth: "x-goog-api-key", key: KEY, models: ["gemini-3.8-flash"], prices: {} };
      return (await call(adm, "/admin/boot", { headers: { authorization: `Bearer ${bt}`, "content-type": "application/json" }, body: JSON.stringify({ upstreams: { gemini: g } }) })).status;
    };
    expect(await boot(true)).toBe(204);
    expect(await boot(false)).toBe(400);
  });
});
