import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { bootTokenHash, createProxyServer, mintBootToken, mintTaskToken } from "./index.js";
import type { RequestLine, TokenClaims } from "./index.js";

// E9г (D-411): Exa for research through the proxy — the engine has an mdt_ token, the key stays here, each call is priced
// against the token's budget.
const secret = randomBytes(32);
const NOW = 1_792_454_400;
const EXA = ["exa", randomBytes(24).toString("hex")].join("-");
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});
async function listen(s: http.Server): Promise<string> {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  closers.push(() => new Promise((r) => { s.closeAllConnections(); s.close(() => r()); }));
  return `http://127.0.0.1:${(s.address() as net.AddressInfo).port}`;
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
async function exaStub() {
  const seen: { path: string; key: string | undefined; body: string }[] = [];
  const s = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c: Buffer) => (b += c.toString()));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", key: req.headers["x-api-key"] as string | undefined, body: b });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ results: [{ url: "https://a.org", title: "A" }] }));
    });
  });
  return { url: await listen(s), seen };
}
async function proxy(o: { exa?: string; boot?: unknown; stub: string }) {
  const dir = mkdtempSync(path.join(tmpdir(), "srch-"));
  const logs: RequestLine[] = [];
  const t = mintBootToken();
  const p = createProxyServer({
    secret, apiKey: "", upstream: "https://api.anthropic.com", usageLogPath: path.join(dir, "usage.jsonl"), now: () => NOW * 1000, log: (l) => logs.push(l),
    searchUpstream: { exa: new URL(o.stub) }, ...(o.exa ? { searchKeys: { exa: o.exa } } : {}),
    ...(o.boot ? { boot: { tokenHash: bootTokenHash(t), expiresAtMs: (NOW + 60) * 1000, spentFile: path.join(dir, "spent") } } : {}),
  });
  const inf = await listen(p.inference);
  const adm = await listen(p.admin);
  if (o.boot) await call(adm, "/admin/boot", { headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify(o.boot) });
  return { inf, logs };
}
const token = (over: Partial<TokenClaims> = {}) => mintTaskToken(secret, { t: "q_x", r: `q_x_${ulid()}`, a: 1, e: NOW + 600, b: 1, n: "aa", ...over });
const auth = (tok: string) => ({ authorization: `Bearer ${tok}`, "content-type": "application/json" });

describe("Exa through the proxy (D-411)", () => {
  it("forwards with the real key, never the token; the call is priced and logged without the body", async () => {
    const stub = await exaStub();
    const p = await proxy({ exa: EXA, stub: stub.url });
    const r = await call(p.inf, "/research/exa/search", { headers: auth(token()), body: JSON.stringify({ query: "jcs", numResults: 8 }) });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).results[0].url).toBe("https://a.org");
    expect(stub.seen[0]).toMatchObject({ path: "/search", key: EXA });
    expect(p.logs.at(-1)).toMatchObject({ path: "/research/exa/search", status: 200, model: "search:exa", usd: 0.007 });
    expect(JSON.stringify(p.logs)).not.toContain(EXA);
    expect(JSON.stringify(p.logs)).not.toContain("jcs");
  });
  it("no key → provider_not_configured; a bad token → 401; an exhausted budget → 403", async () => {
    const stub = await exaStub();
    const none = await proxy({ stub: stub.url });
    expect((await call(none.inf, "/research/exa/search", { headers: auth(token()), body: "{}" })).status).toBe(403);
    const p = await proxy({ exa: EXA, stub: stub.url });
    expect((await call(p.inf, "/research/exa/search", { headers: auth("mdt_bad.sig"), body: "{}" })).status).toBe(401);
    const tight = token({ b: 0.01 });
    expect((await call(p.inf, "/research/exa/search", { headers: auth(tight), body: "{}" })).status).toBe(200);
    expect((await call(p.inf, "/research/exa/search", { headers: auth(tight), body: "{}" })).status).toBe(200);
    expect((await call(p.inf, "/research/exa/search", { headers: auth(tight), body: "{}" })).status).toBe(403);
    expect((await call(p.inf, "/research/other/search", { headers: auth(token()), body: "{}" })).status).toBe(403);
    expect(stub.seen).toHaveLength(2);
  });
  it("the key can arrive in the boot payload; an unknown search provider in it is refused", async () => {
    const stub = await exaStub();
    const p = await proxy({ stub: stub.url, boot: { search: { exa: EXA } } });
    expect((await call(p.inf, "/research/exa/contents", { headers: auth(token()), body: JSON.stringify({ urls: ["https://a.org", "https://b.org"] }) })).status).toBe(200);
    expect(stub.seen[0]).toMatchObject({ path: "/contents", key: EXA });
    expect(p.logs.at(-1)?.usd).toBeCloseTo(0.002, 6);
    const bad = await proxy({ stub: stub.url, boot: { search: { google: EXA } } });
    expect((await call(bad.inf, "/research/exa/search", { headers: auth(token()), body: "{}" })).status).toBe(503);
  });
});
