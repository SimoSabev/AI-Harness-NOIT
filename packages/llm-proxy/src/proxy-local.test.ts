import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { NO_TOOLS_LIMIT, ProxyState, bootTokenHash, createProxyServer, localUpstreamsFromEnv, mintBootToken, mintTaskToken } from "./index.js";
import type { LocalUpstream, RequestLine, TokenClaims } from "./index.js";

// E9в (spec 5.3, AC-3.6, D-422): a local model (Ollama / LM Studio / vLLM) is a proxy upstream named by
// MANDAT_UPSTREAM_LOCAL_<label>; it costs $0, its tokens are counted, and a model that does not call tools is stopped:
// NO_TOOLS_LIMIT replies in a row without a tool (when tools were offered) → the run is refused with `no_tools`.
const secret = randomBytes(32);
const NOW = 1_792_454_400;
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
type Reply = "text" | "tool" | "sse-text" | "sse-tool";
/** A fake local endpoint: answers each request with the next reply of the script (Anthropic Messages wire). */
async function fakeLocal(script: Reply[]) {
  const seen: { path: string; auth: string | undefined; key: string | undefined }[] = [];
  const s = http.createServer((req, res) => {
    seen.push({ path: req.url ?? "", auth: req.headers.authorization, key: req.headers["x-api-key"] as string | undefined });
    req.resume();
    req.on("end", () => {
      const r = script.shift() ?? "text";
      const usage = { input_tokens: 1200, output_tokens: 80 };
      if (r.startsWith("sse")) {
        const block = r === "sse-tool" ? { type: "tool_use", id: "t1", name: "Bash", input: {} } : { type: "text", text: "" };
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage } })}\n\n`);
        res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: block })}\n\n`);
        res.end(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: r === "sse-tool" ? "tool_use" : "end_turn" }, usage: { output_tokens: 80 } })}\n\n`);
        return;
      }
      const content = r === "tool" ? [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }] : [{ type: "text", text: "I would run ls." }];
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ content, stop_reason: r === "tool" ? "tool_use" : "end_turn", usage }));
    });
  });
  return { url: await listen(s), seen };
}
async function proxyWith(locals: Record<string, LocalUpstream>) {
  const dir = mkdtempSync(path.join(tmpdir(), "local-"));
  const logs: RequestLine[] = [];
  const p = createProxyServer({ secret, apiKey: "", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, "usage.jsonl"), now: () => NOW * 1000, log: (l) => logs.push(l), localUpstreams: locals });
  return { inf: await listen(p.inference), adm: await listen(p.admin), logs, state: p.state, file: path.join(dir, "usage.jsonl") };
}
const token = (over: Partial<TokenClaims> = {}) => mintTaskToken(secret, { t: "t_x", r: `r_${ulid()}`, a: 1, e: NOW + 600, b: 0.01, n: "aa", ...over });
const ask = (o: { tools?: boolean; model?: string } = {}) => JSON.stringify({ model: o.model ?? "qwen3-coder:30b", max_tokens: 64, messages: [{ role: "user", content: "fix" }], ...(o.tools === false ? {} : { tools: [{ name: "Bash", input_schema: { type: "object" } }] }) });
const send = (inf: string, tok: string, body: string) => call(inf, "/v1/messages", { headers: { "x-api-key": tok, "content-type": "application/json" }, body });

describe("local upstream from the environment (D-422)", () => {
  it("MANDAT_UPSTREAM_LOCAL_<label> → upstream local-<label>; models and wire from the companion variables", () => {
    const r = localUpstreamsFromEnv({
      MANDAT_UPSTREAM_LOCAL_OLLAMA: "http://127.0.0.1:11434",
      MANDAT_UPSTREAM_LOCAL_OLLAMA_MODELS: "qwen3-coder:30b, gpt-oss:20b",
      MANDAT_UPSTREAM_LOCAL_VLLM_BOX: "https://vllm.lan.example/v1x",
      MANDAT_UPSTREAM_LOCAL_VLLM_BOX_MODELS: "Qwen/Qwen3-Coder-30B",
      MANDAT_UPSTREAM_LOCAL_VLLM_BOX_WIRE: "openai",
      PATH: "/usr/bin",
    });
    expect(r.errors).toEqual([]);
    expect(r.upstreams).toEqual({
      "local-ollama": { wire: "anthropic", url: "http://host.docker.internal:11434", models: ["qwen3-coder:30b", "gpt-oss:20b"] },
      "local-vllm-box": { wire: "openai", url: "https://vllm.lan.example/v1x", models: ["Qwen/Qwen3-Coder-30B"] },
    });
  });
  it("refused: no models, a LAN IP, a bad wire, a bad label — named in errors, never with the value", () => {
    const r = localUpstreamsFromEnv({
      MANDAT_UPSTREAM_LOCAL_A: "http://127.0.0.1:1",
      MANDAT_UPSTREAM_LOCAL_B: "http://10.0.0.5:8000",
      MANDAT_UPSTREAM_LOCAL_B_MODELS: "m",
      MANDAT_UPSTREAM_LOCAL_C: "http://localhost:1234",
      MANDAT_UPSTREAM_LOCAL_C_MODELS: "m",
      MANDAT_UPSTREAM_LOCAL_C_WIRE: "gemini",
      "MANDAT_UPSTREAM_LOCAL_bad!": "http://127.0.0.1:1",
    });
    expect(r.upstreams).toEqual({});
    expect(r.errors.sort()).toEqual(["MANDAT_UPSTREAM_LOCAL_A: models missing", "MANDAT_UPSTREAM_LOCAL_B: bad address", "MANDAT_UPSTREAM_LOCAL_C: bad wire", "MANDAT_UPSTREAM_LOCAL_bad!: bad label"]);
  });
});

describe("AC-3.6 local channel through the proxy (fake endpoint, D-422)", () => {
  it("$0, tokens counted, no key sent; the token's budget does not stop a free model", async () => {
    const up = await fakeLocal(["tool", "tool", "text"]);
    const p = await proxyWith({ "local-ollama": { wire: "anthropic", url: up.url, models: ["qwen3-coder:30b"] } });
    const tok = token({ u: "local-ollama" });
    for (let i = 0; i < 3; i++) expect((await send(p.inf, tok, ask())).status).toBe(200);
    expect(up.seen.map((s) => [s.path, s.auth, s.key])).toEqual(Array(3).fill(["/v1/messages", undefined, undefined]));
    const runId = p.logs[0]?.run_id as string;
    expect(p.state.usage(runId)).toMatchObject({ usd: 0, inputTokens: 3600, outputTokens: 240, requests: 3, budgetStop: false, noTools: false });
    expect(p.logs.map((l) => [l.upstream, l.usd, l.estimated])).toEqual(Array(3).fill(["local-ollama", 0, undefined]));
    expect((await send(p.inf, tok, ask({ model: "llama3" }))).status).toBe(403);
  });
  it(`${NO_TOOLS_LIMIT} replies in a row without a tool → no_tools: the next call is refused and usage says so`, async () => {
    const up = await fakeLocal(["text", "tool", "text", "sse-text", "text", "text"]);
    const p = await proxyWith({ "local-ollama": { wire: "anthropic", url: up.url, models: ["qwen3-coder:30b"] } });
    const tok = token({ u: "local-ollama" });
    // text, tool (resets), text, sse text, a call that offers no tools (does not count), text → 3 in a row
    for (const b of [ask(), ask(), ask(), ask(), ask({ tools: false }), ask()]) expect((await send(p.inf, tok, b)).status).toBe(200);
    const runId = p.logs[0]?.run_id as string;
    expect(p.state.usage(runId).noTools).toBe(true);
    const r = await send(p.inf, tok, ask());
    expect([r.status, JSON.parse(r.body).error.message]).toEqual([403, "mandat: no_tools"]);
    expect(up.seen).toHaveLength(6);
    const u = await call(p.adm, `/admin/usage?run_id=${runId}`, { method: "GET", headers: { authorization: `Bearer ${(await import("./token.js")).adminBearer(secret)}` } });
    expect(JSON.parse(u.body).noTools).toBe(true);
    // replay after a restart keeps it (usage.jsonl is the durable state, D-116)
    expect(new ProxyState(p.file).usage(runId).noTools).toBe(true);
  });
  it("an SSE tool_use resets the streak", async () => {
    const up = await fakeLocal(["text", "text", "sse-tool", "text", "text"]);
    const p = await proxyWith({ "local-ollama": { wire: "anthropic", url: up.url, models: ["qwen3-coder:30b"] } });
    const tok = token({ u: "local-ollama" });
    for (let i = 0; i < 5; i++) expect((await send(p.inf, tok, ask())).status).toBe(200);
    expect(p.state.usage(p.logs[0]?.run_id as string).noTools).toBe(false);
  });
  it("a saved local connection (boot payload, local: true) is counted too; a paid one never is; env locals survive the boot", async () => {
    const up = await fakeLocal(Array(8).fill("text"));
    const dir = mkdtempSync(path.join(tmpdir(), "local-"));
    const logs: RequestLine[] = [];
    const bt = mintBootToken();
    const p = createProxyServer({
      secret, apiKey: "", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, "usage.jsonl"), now: () => NOW * 1000, log: (l) => logs.push(l), allowHttpUpstream: true,
      boot: { tokenHash: bootTokenHash(bt), expiresAtMs: (NOW + 60) * 1000, spentFile: path.join(dir, "spent") },
      localUpstreams: { "local-env": { wire: "anthropic", url: up.url, models: ["m"] } },
    });
    const inf = await listen(p.inference);
    const adm = await listen(p.admin);
    const conn = (local: boolean) => ({ wire: "anthropic", url: up.url, auth: "none", key: "", models: ["qwen3-coder:30b"], prices: { "qwen3-coder:30b": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }, ...(local ? { local: true } : {}) });
    const b = await call(adm, "/admin/boot", { headers: { authorization: `Bearer ${bt}`, "content-type": "application/json" }, body: JSON.stringify({ upstreams: { ollama: conn(true), paid: conn(false) } }) });
    expect(b.status).toBe(204);
    const h = JSON.parse((await call(adm, "/healthz", { method: "GET" })).body) as { upstreams: string[] };
    expect(h.upstreams).toEqual(["local-env", "ollama", "paid"]);
    const local = token({ u: "ollama" });
    const paid = token({ u: "paid" });
    for (let i = 0; i < 3; i++) {
      await send(inf, local, ask());
      await send(inf, paid, ask());
    }
    const run = (t: string) => logs.find((l) => l.upstream === t)?.run_id as string;
    expect(p.state.usage(run("ollama")).noTools).toBe(true);
    expect(p.state.usage(run("paid")).noTools).toBe(false);
  });
  it("only env locals: an empty boot payload unlocks the proxy (nothing else to send)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "local-"));
    const bt = mintBootToken();
    const p = createProxyServer({
      secret, apiKey: "", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, "usage.jsonl"), now: () => NOW * 1000, log: () => undefined,
      boot: { tokenHash: bootTokenHash(bt), expiresAtMs: (NOW + 60) * 1000, spentFile: path.join(dir, "spent") },
      localUpstreams: { "local-ollama": { wire: "anthropic", url: "http://127.0.0.1:9", models: ["m"] } },
    });
    const adm = await listen(p.admin);
    expect((await call(adm, "/admin/boot", { headers: { authorization: `Bearer ${bt}`, "content-type": "application/json" }, body: "{}" })).status).toBe(204);
    expect(JSON.parse((await call(adm, "/healthz", { method: "GET" })).body)).toMatchObject({ locked: false, upstreams: ["local-ollama"] });
  });
});
