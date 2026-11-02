import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { bootTokenHash, createProxyServer, mintBootToken, mintTaskToken } from "./index.js";
import type { RequestLine } from "./index.js";

// D-449: the client gave up → the proxy stops waiting. A reply nobody reads is not worth waiting (or paying) for.
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
const until = async (f: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!f()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
};
const usageMetadata = { promptTokenCount: 1_000_000, candidatesTokenCount: 100_000, totalTokenCount: 1_100_000 };

/** A slow provider: `mode` says how far it gets before it stops answering. It records when its side of the request closes. */
async function slowUpstream(mode: "silent" | "half-sse" | "answers", onHit: () => void = () => undefined) {
  const u = { hits: 0, closed: 0, finished: 0, url: "" };
  u.url = await listen(http.createServer((req, res) => {
    u.hits++;
    onHit();
    res.on("close", () => {
      if (res.writableFinished) u.finished++;
      else u.closed++;
    });
    req.resume();
    req.on("end", () => {
      if (mode === "answers") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ candidates: [], usageMetadata }));
      if (mode === "half-sse") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ candidates: [], usageMetadata })}\r\n\r\n`);
      }
    });
  }));
  return u;
}
async function proxy(upUrl: string, clock: { t: number }) {
  const dir = mkdtempSync(path.join(tmpdir(), "abort-"));
  const logs: RequestLine[] = [];
  const bt = mintBootToken();
  const p = createProxyServer({
    secret, apiKey: "", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, "usage.jsonl"), now: () => clock.t, log: (l) => logs.push(l), allowHttpUpstream: true,
    boot: { tokenHash: bootTokenHash(bt), expiresAtMs: (NOW + 60) * 1000, spentFile: path.join(dir, "spent") },
  });
  const inf = await listen(p.inference);
  const adm = await listen(p.admin);
  const g = { wire: "gemini", url: upUrl, auth: "x-goog-api-key", key: KEY, models: ["gemini-2.5-pro"], prices: { "gemini-2.5-pro": { input: 1, output: 10, cacheRead: 0.1, cacheWrite: 1 } } };
  const boot = await fetch(`${adm}/admin/boot`, { method: "POST", headers: { authorization: `Bearer ${bt}`, "content-type": "application/json" }, body: JSON.stringify({ upstreams: { gemini: g } }) });
  expect(boot.status).toBe(204);
  const runId = `r_${ulid()}`;
  const tok = mintTaskToken(secret, { t: "t_x", r: runId, a: 1, e: NOW + 600, b: 50, n: "aa", p: "gemini", u: "gemini" });
  return { inf, logs, state: p.state, runId, tok };
}
const send = (p: { inf: string; tok: string }, sub: string, onResponse?: (res: http.IncomingMessage, req: http.ClientRequest) => void) => {
  const req = http.request(`${p.inf}/v1beta/models/gemini-2.5-pro:${sub}`, { method: "POST", headers: { "x-goog-api-key": p.tok, "content-type": "application/json" } }, (res) => {
    res.on("error", () => undefined);
    onResponse?.(res, req);
  });
  req.on("error", () => undefined);
  req.end(JSON.stringify({ contents: [] }));
  return req;
};

describe("the client disconnects (D-449)", () => {
  it("before any reply: the upstream request is aborted; one line, status 499, nothing invented", async () => {
    const clock = { t: NOW * 1000 };
    const up = await slowUpstream("silent", () => (clock.t += 60_000));
    const p = await proxy(up.url, clock);
    const req = send(p, "generateContent");
    await until(() => up.hits === 1);
    req.destroy();
    await until(() => up.closed === 1);
    await until(() => p.logs.length === 1);
    expect(p.logs[0]).toMatchObject({ status: 499, aborted: true, usd: 0, input_tokens: 0, output_tokens: 0, duration_ms: 60_000, run_id: p.runId, provider: "gemini" });
    expect(p.state.usage(p.runId)).toMatchObject({ usd: 0, requests: 1, authFailed: false });
    await new Promise((r) => setTimeout(r, 30));
    expect(p.logs).toHaveLength(1);
  });
  it("in the middle of a stream: aborted; the usage already seen is recorded and priced, no more than that", async () => {
    const clock = { t: NOW * 1000 };
    const up = await slowUpstream("half-sse");
    const p = await proxy(up.url, clock);
    send(p, "streamGenerateContent?alt=sse", (res, req) => res.once("data", () => req.destroy()));
    await until(() => up.closed === 1);
    await until(() => p.logs.length === 1);
    // the one chunk seen: 1 M input × $1 + 0.1 M output × $10 = $2
    expect(p.logs[0]).toMatchObject({ status: 200, aborted: true, input_tokens: 1_000_000, output_tokens: 100_000, usd: 2 });
    expect(p.state.usage(p.runId).usd).toBe(2);
  });
  it("a reply the client reads to the end: never aborted, a duration, the same usage as always", async () => {
    const clock = { t: NOW * 1000 };
    const up = await slowUpstream("answers", () => (clock.t += 1234));
    const p = await proxy(up.url, clock);
    await new Promise<void>((resolve) => send(p, "generateContent", (res) => {
      res.resume();
      res.on("end", () => resolve());
    }));
    await until(() => p.logs.length === 1);
    await until(() => up.finished === 1);
    expect(p.logs[0]).toMatchObject({ status: 200, input_tokens: 1_000_000, output_tokens: 100_000, usd: 2, duration_ms: 1234 });
    expect(p.logs[0]?.aborted).toBeUndefined();
    expect(up.closed).toBe(0);
    await new Promise((r) => setTimeout(r, 30));
    expect(p.logs).toHaveLength(1);
  });
  it("a request refused by the proxy has a duration too; the log holds no bodies", async () => {
    const clock = { t: NOW * 1000 };
    const up = await slowUpstream("answers");
    const p = await proxy(up.url, clock);
    await new Promise<void>((resolve) => {
      const r = http.request(`${p.inf}/v1beta/models/gemini-9:generateContent`, { method: "POST", headers: { "x-goog-api-key": p.tok } }, (res) => {
        res.resume();
        res.on("end", () => resolve());
      });
      r.end("{\"contents\":[{\"parts\":[{\"text\":\"BODY-TEXT\"}]}]}");
    });
    expect(p.logs[0]).toMatchObject({ status: 403, duration_ms: 0 });
    expect(JSON.stringify(p.logs)).not.toContain("BODY-TEXT");
  });
  it("a search call the client gave up on is aborted too and costs nothing", async () => {
    const up = await slowUpstream("silent");
    const logs: RequestLine[] = [];
    const dir = mkdtempSync(path.join(tmpdir(), "abort-"));
    const q = createProxyServer({ secret, apiKey: "x", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, "usage.jsonl"), now: () => NOW * 1000, log: (l) => logs.push(l), allowHttpUpstream: true, searchKeys: { exa: "k" }, searchUpstream: { exa: new URL(up.url) } });
    const inf = await listen(q.inference);
    const tok = mintTaskToken(secret, { t: "t_x", r: `r_${ulid()}`, a: 1, e: NOW + 600, b: 50, n: "aa" });
    const req = http.request(`${inf}/research/exa/search`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" } });
    req.on("error", () => undefined);
    req.end(JSON.stringify({ query: "x" }));
    await until(() => up.hits === 1);
    req.destroy();
    await until(() => up.closed === 1);
    await until(() => logs.length === 1);
    expect(logs[0]).toMatchObject({ usd: 0, model: "search:exa" });
  });
});
