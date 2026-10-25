import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import dgram from "node:dgram";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { GateRouteSchema, ulid } from "@mandat/contract";
import type { GatePolicy, GateRoute } from "@mandat/contract";
import { buildDnsResponse, decideDns, matchPolicy, matchTunnel, npmAllowlistFromLockfile, parseDnsQuery, startGate } from "./index.js";

const RUN = "r_" + ulid();
const LLM: GateRoute[] = [
  { id: "llm-messages", method: "POST", match: { kind: "exact", path: "/v1/messages" }, upstream: "llm_proxy" },
  { id: "llm-count", method: "POST", match: { kind: "exact", path: "/v1/messages/count_tokens" }, upstream: "llm_proxy" },
  { id: "hello", method: "HEAD", match: { kind: "exact", path: "/api/hello" }, upstream: "local_ok" },
];
const pol = (phase: GatePolicy["phase"], routes: GateRoute[] = LLM): GatePolicy => ({ version: 1, run_id: RUN, phase, routes });

describe("matchPolicy (6.8, D-100)", () => {
  it("CONNECT, exact+query, грешен метод, closed, install", () => {
    expect(matchPolicy(pol("agent"), "CONNECT", "example.com:443")).toEqual({ allow: false, reason: "connect" });
    expect(matchPolicy(pol("agent"), "POST", "/v1/messages?beta=true")).toMatchObject({ allow: true, route: { id: "llm-messages" } });
    expect(matchPolicy(pol("agent"), "GET", "/v1/messages")).toEqual({ allow: false, reason: "no_route" });
    expect(matchPolicy(pol("agent"), "PUT", "/npm/left-pad")).toEqual({ allow: false, reason: "no_route" });
    expect(matchPolicy(pol("closed"), "POST", "/v1/messages")).toEqual({ allow: false, reason: "phase_closed" });
    expect(matchPolicy(pol("install", []), "POST", "/v1/messages")).toEqual({ allow: false, reason: "no_route" });
  });
  it("bad_path", () => {
    for (const p of ["/npm/../v1/messages", "//v1/messages", "/v1/%2e%2e/x", "/v1/%2E%2E/x"]) {
      expect(matchPolicy(pol("agent"), "POST", p)).toEqual({ allow: false, reason: "bad_path" });
    }
    const scoped = pol("install", [{ id: "d", method: "GET", match: { kind: "exact", path: "/npm/@vitest%2fexpect" }, upstream: "npm_registry" }]);
    expect(matchPolicy(scoped, "GET", "/npm/@vitest%2fexpect").allow).toBe(true);
    expect(matchPolicy(scoped, "GET", "/npm/@other%2fpkg")).toEqual({ allow: false, reason: "bad_path" });
    const prefix = pol("install", [{ id: "p", method: "GET", match: { kind: "prefix", path: "/npm/" }, upstream: "npm_registry" }]);
    expect(matchPolicy(prefix, "GET", "/npm/../v1/messages")).toEqual({ allow: false, reason: "bad_path" });
    expect(matchPolicy(prefix, "GET", "/npm/left-pad").allow).toBe(true);
  });
});

describe("npm prefix route and scoped packages (E8e, D-354)", () => {
  it("a scoped packument (/npm/@scope%2fname) passes an npm prefix route; any other %2f, %2e or .. does not", () => {
    const p = pol("install", [{ id: "mcp-npm", method: "GET", match: { kind: "prefix", path: "/npm/" }, upstream: "npm_registry" }]);
    expect(matchPolicy(p, "GET", "/npm/@modelcontextprotocol%2fserver").allow).toBe(true);
    expect(matchPolicy(p, "GET", "/npm/@modelcontextprotocol%2Fserver").allow).toBe(true);
    expect(matchPolicy(p, "GET", "/npm/@modelcontextprotocol/server/-/server-2.3.1.tgz").allow).toBe(true);
    for (const bad of ["/npm/@a%2fb%2fc", "/npm/@a%2f..%2fb", "/npm/x%2fy", "/npm/@a%2f%2e%2e", "/npm/@a%2fb/../../v1/messages"]) expect(matchPolicy(p, "GET", bad)).toEqual({ allow: false, reason: "bad_path" });
    const llm = pol("install", [{ id: "p", method: "GET", match: { kind: "prefix", path: "/v1/" }, upstream: "llm_proxy" }]);
    expect(matchPolicy(llm, "GET", "/v1/@a%2fb")).toEqual({ allow: false, reason: "bad_path" });
  });
});

describe("matchTunnel (D-294)", () => {
  it("only exact host:port from tunnels, only in the agent phase; no tunnels → never", () => {
    const p: GatePolicy = { ...pol("agent", []), tunnels: [{ host: "api.anthropic.com", port: 443 }] };
    expect(matchTunnel(p, "api.anthropic.com:443")).toEqual({ allow: true, host: "api.anthropic.com", port: 443 });
    expect(matchTunnel(p, "API.Anthropic.com:443")).toEqual({ allow: true, host: "api.anthropic.com", port: 443 });
    expect(matchTunnel(p, "api.anthropic.com:80").allow).toBe(false);
    expect(matchTunnel(p, "evil.api.anthropic.com:443").allow).toBe(false);
    expect(matchTunnel(p, "api.anthropic.com.evil.com:443").allow).toBe(false);
    expect(matchTunnel(p, "api.anthropic.com").allow).toBe(false);
    expect(matchTunnel({ ...p, phase: "install" }, "api.anthropic.com:443").allow).toBe(false);
    expect(matchTunnel({ ...p, phase: "closed" }, "api.anthropic.com:443").allow).toBe(false);
    expect(matchTunnel(pol("agent", []), "api.anthropic.com:443").allow).toBe(false);
  });
});

describe("npmAllowlistFromLockfile", () => {
  const entry = (resolved: string, extra: Record<string, unknown> = {}) => ({ resolved, integrity: "sha512-" + "a".repeat(86) + "==", ...extra });
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { name: "shop" },
      "node_modules/vitest": entry("https://registry.npmjs.org/vitest/-/vitest-5.0.5.tgz"),
      "node_modules/@vitest/expect": entry("https://registry.npmjs.org/@vitest/expect/-/expect-5.0.5.tgz"),
      "node_modules/tinyrainbow": entry("https://registry.npmjs.org/tinyrainbow/-/tinyrainbow-3.0.0.tgz"),
      "node_modules/x/node_modules/bundled": { inBundle: true },
    },
  };
  it("v3 ок", () => {
    const r = npmAllowlistFromLockfile(lock);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.packages).toBe(3);
    expect(r.routes.map((x) => x.match.path)).toEqual([
      "/npm/vitest/-/vitest-5.0.5.tgz",
      "/npm/vitest",
      "/npm/@vitest/expect/-/expect-5.0.5.tgz",
      "/npm/@vitest/expect",
      "/npm/@vitest%2fexpect",
      "/npm/@vitest%2Fexpect",
      "/npm/tinyrainbow/-/tinyrainbow-3.0.0.tgz",
      "/npm/tinyrainbow",
    ]);
    expect(r.routes.map((x) => x.id)).toContain("npm-tgz-3");
    for (const route of r.routes) expect(() => GateRouteSchema.parse(route)).not.toThrow();
  });
  it("дедупликация", () => {
    const r = npmAllowlistFromLockfile({
      lockfileVersion: 3,
      packages: { "node_modules/a": entry("https://registry.npmjs.org/a/-/a-1.0.0.tgz"), "node_modules/b/node_modules/a": entry("https://registry.npmjs.org/a/-/a-1.0.0.tgz") },
    });
    expect(r.ok && r.routes.filter((x) => x.id.startsWith("npm-tgz")).length).toBe(1);
  });
  it("откази", () => {
    const one = (e: Record<string, unknown>) => npmAllowlistFromLockfile({ lockfileVersion: 3, packages: { "node_modules/x": e } });
    expect(npmAllowlistFromLockfile({ lockfileVersion: 2, packages: {} })).toMatchObject({ ok: false, reason: "not_v3" });
    expect(npmAllowlistFromLockfile(null)).toMatchObject({ ok: false, reason: "not_v3" });
    expect(one(entry("git+https://github.com/x/y.git"))).toMatchObject({ ok: false, reason: "git_or_url_dep" });
    expect(one(entry("https://evil.example/x.tgz"))).toMatchObject({ ok: false, reason: "foreign_resolved", path: "node_modules/x" });
    expect(one({ link: true, resolved: "../x" })).toMatchObject({ ok: false, reason: "link_dep" });
    expect(one({ resolved: "https://registry.npmjs.org/x/-/x-1.tgz" })).toMatchObject({ ok: false, reason: "bad_integrity" });
    expect(one({ integrity: "sha512-x" })).toMatchObject({ ok: false, reason: "missing_resolved" });
  });
});

function dnsQuery(name: string, qtype: number, id = 0x1234): Buffer {
  const labels = name.split(".").filter(Boolean).map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)]));
  return Buffer.concat([Buffer.from([id >> 8, id & 0xff, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]), ...labels, Buffer.from([0, qtype >> 8, qtype & 0xff, 0, 1])]);
}

describe("dns", () => {
  it("parse/build", () => {
    const q = parseDnsQuery(dnsQuery("egress-gate", 1));
    expect(q).toEqual({ id: 0x1234, name: "egress-gate", qtype: 1 });
    if (!q) return;
    const a = buildDnsResponse(q, { kind: "a", ip: "172.30.0.2" });
    expect(a.readUInt16BE(6)).toBe(1);
    expect([...a.subarray(a.length - 4)]).toEqual([172, 30, 0, 2]);
    const nx = buildDnsResponse({ id: 1, name: "evil.example", qtype: 1 }, { kind: "nxdomain" });
    expect(nx.readUInt16BE(2) & 0xf).toBe(3);
    expect(parseDnsQuery(Buffer.from([1, 2, 3]))).toBeNull();
    expect(parseDnsQuery(Buffer.concat([dnsQuery("a.b", 1).subarray(0, 14)]))).toBeNull();
    const resp = Buffer.from(dnsQuery("x", 1));
    resp[2] = 0x81;
    expect(parseDnsQuery(resp)).toBeNull();
    const zero = Buffer.from(dnsQuery("x", 1));
    zero[5] = 0;
    expect(parseDnsQuery(zero)).toBeNull();
    const comp = Buffer.concat([dnsQuery("x", 1).subarray(0, 12), Buffer.from([0xc0, 0x0c, 0, 1, 0, 1])]);
    expect(parseDnsQuery(comp)).toBeNull();
  });
  it("decideDns (D-045)", () => {
    expect(decideDns({ name: "egress-gate", qtype: 1 }, "172.30.0.2")).toEqual({ answer: { kind: "a", ip: "172.30.0.2" }, logBlock: false });
    expect(decideDns({ name: "EGRESS-GATE.", qtype: 1 }, "172.30.0.2").answer.kind).toBe("a");
    expect(decideDns({ name: "egress-gate", qtype: 28 }, "172.30.0.2")).toEqual({ answer: { kind: "nodata" }, logBlock: false });
    expect(decideDns({ name: "evil.example", qtype: 15 }, "172.30.0.2")).toEqual({ answer: { kind: "nxdomain" }, logBlock: true });
    expect(decideDns({ name: "egress-gate", qtype: 1 }, null)).toEqual({ answer: { kind: "servfail" }, logBlock: false });
    const nodata = buildDnsResponse({ id: 1, name: "egress-gate", qtype: 28 }, { kind: "nodata" });
    expect(nodata.readUInt16BE(2) & 0xf).toBe(0);
    expect(nodata.readUInt16BE(6)).toBe(0);
    expect(buildDnsResponse({ id: 1, name: "x", qtype: 1 }, { kind: "servfail" }).readUInt16BE(2) & 0xf).toBe(2);
  });
});

// ---------- in-process gate ----------
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});

function writePolicy(dir: string, p: unknown): void {
  const tmp = path.join(dir, `.policy.${Date.now()}.tmp`);
  writeFileSync(tmp, typeof p === "string" ? p : JSON.stringify(p));
  renameSync(tmp, path.join(dir, "policy.json"));
}

async function stub(handler: http.RequestListener): Promise<{ url: string; calls: () => number }> {
  let n = 0;
  const s = http.createServer((req, res) => {
    n++;
    handler(req, res);
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  closers.push(() => new Promise((r) => { s.closeAllConnections(); s.close(() => r()); }));
  const a = s.address() as net.AddressInfo;
  return { url: `http://127.0.0.1:${a.port}`, calls: () => n };
}

async function gate(p: unknown, extra: { llmProxyUrl?: string; npmRegistryUrl?: string } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "mandat-gate-"));
  const policyDir = path.join(root, "policy");
  mkdirSync(policyDir, { recursive: true });
  if (p !== undefined) writePolicy(policyDir, p);
  writeFileSync(path.join(policyDir, "self-ip"), "172.30.0.2\n");
  const logPath = path.join(root, "log", "events.jsonl");
  const g = await startGate({ policyDir, logPath, npmCacheDir: path.join(root, "cache"), httpPort: 0, dnsPort: 0, ...extra });
  closers.push(() => g.close());
  const lines = () => (existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : []);
  return { g, policyDir, lines, base: `http://127.0.0.1:${g.httpPort}` };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn: () => boolean, ms = 2000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}

function req(base: string, method: string, p: string, headers: Record<string, string> = {}, body?: string) {
  return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const r = http.request(base + p, { method, headers }, (res) => {
      let b = "";
      res.on("data", (c: Buffer) => (b += c.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b, headers: res.headers }));
    });
    r.on("error", reject);
    r.end(body);
  });
}

function dnsAsk(port: number, name: string, qtype: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    const t = setTimeout(() => { s.close(); resolve(null); }, 500);
    s.on("message", (m) => { clearTimeout(t); s.close(); resolve(m); });
    s.send(dnsQuery(name, qtype), port, "127.0.0.1");
  });
}

describe("gate server", () => {
  it("policy_loaded (D-044) и невалидна политика", async () => {
    const { policyDir, lines } = await gate(pol("install", []));
    await waitFor(() => lines().some((l) => l.kind === "policy_loaded" && l.phase === "install"));
    const t0 = Date.now();
    writePolicy(policyDir, pol("agent"));
    await waitFor(() => lines().some((l) => l.kind === "policy_loaded" && l.phase === "agent"), 300);
    expect(Date.now() - t0).toBeLessThanOrEqual(300);
    const n = lines().length;
    writePolicy(policyDir, "{not json");
    await sleep(300);
    expect(lines().length).toBe(n);
  });

  it("startGate llmProxyUrl; заглавки; streaming без буфериране", async () => {
    let seen: http.IncomingHttpHeaders = {};
    const up = await stub((rq, res) => {
      seen = rq.headers;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("event: a\ndata: 1\n\n");
      setTimeout(() => res.write("event: b\ndata: 2\n\n"), 200);
      setTimeout(() => res.end("event: c\ndata: 3\n\n"), 400);
    });
    const { base } = await gate(pol("agent"), { llmProxyUrl: up.url });
    const t0 = Date.now();
    const firstChunkAt = await new Promise<number>((resolve, reject) => {
      const r = http.request(base + "/v1/messages?beta=true", {
        method: "POST",
        headers: { "x-api-key": "mdt_x", "anthropic-version": "2023-06-01", "anthropic-beta": "b1", connection: "keep-alive", "proxy-authorization": "x" },
      }, (res) => {
        res.once("data", () => resolve(Date.now()));
        res.resume();
      });
      r.on("error", reject);
      r.end("{}");
    });
    expect(firstChunkAt - t0).toBeLessThan(150);
    expect(seen["x-api-key"]).toBe("mdt_x");
    expect(seen["anthropic-version"]).toBe("2023-06-01");
    expect(seen["anthropic-beta"]).toBe("b1");
    expect(seen["proxy-authorization"]).toBeUndefined();
    expect(seen.host).toBe(new URL(up.url).host);
  });

  it("HEAD /api/hello локално; блок се логва; CONNECT → 403", async () => {
    const up = await stub((_q, res) => res.end());
    const { base, lines, g } = await gate(pol("agent"), { llmProxyUrl: up.url });
    expect((await req(base, "HEAD", "/api/hello")).status).toBe(200);
    expect(up.calls()).toBe(0);
    expect((await req(base, "PUT", "/npm/x")).status).toBe(403);
    const connect = await new Promise<string>((resolve) => {
      const s = net.connect(g.httpPort, "127.0.0.1", () => s.write("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n"));
      let b = "";
      s.on("data", (c) => (b += c.toString()));
      s.on("close", () => resolve(b));
    });
    expect(connect).toMatch(/^HTTP\/1\.1 403/);
    await waitFor(() => lines().filter((l) => l.kind === "proxy_block").length >= 2);
    const blocks = lines().filter((l) => l.kind === "proxy_block");
    expect(blocks.map((b) => b.method)).toEqual(expect.arrayContaining(["PUT", "CONNECT"]));
    expect(lines().some((l) => l.kind === "proxy_block" && l.path === "/api/hello")).toBe(false);
  });

  it("D-294: CONNECT към разрешен тунел → 200 и байтовете минават; друг хост → 403; лог без съдържание", async () => {
    const echo = net.createServer((c) => c.on("data", (d) => c.write(d)));
    await new Promise<void>((r) => echo.listen(0, "127.0.0.1", () => r()));
    closers.push(() => new Promise((r) => echo.close(() => r())));
    const port = (echo.address() as net.AddressInfo).port;
    const { g, lines } = await gate({ ...pol("agent", []), tunnels: [{ host: "127.0.0.1", port }] });
    await waitFor(() => lines().some((l) => l.kind === "policy_loaded"));
    const ask = (authority: string, payload: string) =>
      new Promise<string>((resolve) => {
        const s = net.connect(g.httpPort, "127.0.0.1", () => s.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
        let b = "";
        s.on("data", (c) => {
          b += c.toString();
          if (b.includes("\r\n\r\n") && !b.includes(payload) && b.startsWith("HTTP/1.1 200")) s.write(payload);
          if (b.includes(payload)) s.end();
        });
        s.on("close", () => resolve(b));
      });
    const ok = await ask(`127.0.0.1:${port}`, "secret-bytes-xyz");
    expect(ok).toMatch(/^HTTP\/1\.1 200/);
    expect(ok).toContain("secret-bytes-xyz");
    expect(await ask("example.com:443", "z")).toMatch(/^HTTP\/1\.1 403/);
    await waitFor(() => lines().some((l) => l.kind === "tunnel"));
    expect(lines().find((l) => l.kind === "tunnel")).toMatchObject({ method: "CONNECT", path: `127.0.0.1:${port}`, status: 200 });
    expect(JSON.stringify(lines())).not.toContain("secret-bytes-xyz");
  });

  it("E3в: Upgrade (websocket) към /v1/responses → 403, логва се, upstream не вижда нищо", async () => {
    const up = await stub((_q, res) => res.end());
    const { g, lines } = await gate(pol("agent"), { llmProxyUrl: up.url });
    const answer = await new Promise<string>((resolve) => {
      const s = net.connect(g.httpPort, "127.0.0.1", () => s.write("GET /v1/responses HTTP/1.1\r\nHost: egress-gate\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"));
      let b = "";
      s.on("data", (c) => (b += c.toString()));
      s.on("close", () => resolve(b));
    });
    expect(answer).toMatch(/^HTTP\/1\.1 403/);
    expect(up.calls()).toBe(0);
    await waitFor(() => lines().some((l) => l.kind === "proxy_block" && l.method === "GET upgrade"));
  });

  it("upstream недостъпен → 502", async () => {
    const { base } = await gate(pol("agent"), { llmProxyUrl: "http://127.0.0.1:1" });
    expect((await req(base, "POST", "/v1/messages", {}, "{}")).status).toBe(502);
  });

  it("npm кеш (D-111) и packument", async () => {
    const reg = await stub((rq, res) => {
      if (rq.url?.endsWith(".tgz")) {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end("TARBALL");
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"name":"left-pad"}');
      }
    });
    const routes: GateRoute[] = [
      { id: "t", method: "GET", match: { kind: "exact", path: "/npm/left-pad/-/left-pad-1.3.0.tgz" }, upstream: "npm_registry" },
      { id: "d", method: "GET", match: { kind: "exact", path: "/npm/left-pad" }, upstream: "npm_registry" },
    ];
    const { base } = await gate(pol("install", routes), { npmRegistryUrl: reg.url });
    expect((await req(base, "GET", "/npm/left-pad/-/left-pad-1.3.0.tgz")).body).toBe("TARBALL");
    await sleep(50);
    expect((await req(base, "GET", "/npm/left-pad/-/left-pad-1.3.0.tgz")).body).toBe("TARBALL");
    expect((await req(base, "GET", "/npm/left-pad")).body).toContain("left-pad");
    expect(reg.calls()).toBe(2); // 1 tarball + 1 packument
  });

  it("без политика (D-137): HTTP 403, DNS SERVFAIL, без редове", async () => {
    const { base, lines, g } = await gate("{bad");
    expect((await req(base, "POST", "/v1/messages")).status).toBe(403);
    const r = await dnsAsk(g.dnsPort, "egress-gate", 1);
    expect(r && (r.readUInt16BE(2) & 0xf)).toBe(2);
    expect(lines()).toEqual([]);
  });

  it("DNS сървър: A, AAAA, NXDOMAIN + dns_block, боклук без отговор", async () => {
    const { g, lines } = await gate(pol("agent"));
    const a = await dnsAsk(g.dnsPort, "egress-gate", 1);
    expect(a && [...a.subarray(a.length - 4)]).toEqual([172, 30, 0, 2]);
    const aaaa = await dnsAsk(g.dnsPort, "egress-gate", 28);
    expect(aaaa && aaaa.readUInt16BE(6)).toBe(0);
    const nx = await dnsAsk(g.dnsPort, "evil.example", 1);
    expect(nx && (nx.readUInt16BE(2) & 0xf)).toBe(3);
    await waitFor(() => lines().some((l) => l.kind === "dns_block" && l.qname === "evil.example"));
    expect(lines().some((l) => l.kind === "dns_block" && l.qname === "egress-gate")).toBe(false);
    const junk = await new Promise<Buffer | null>((resolve) => {
      const s = dgram.createSocket("udp4");
      const t = setTimeout(() => { s.close(); resolve(null); }, 300);
      s.on("message", (m) => { clearTimeout(t); s.close(); resolve(m); });
      s.send(Buffer.from([1, 2, 3]), g.dnsPort, "127.0.0.1");
    });
    expect(junk).toBeNull();
  });
});

describe("MCP routes to the sidecar (E8e, D-354)", () => {
  it("the schema: an mcp route needs its target (http://<host>:<port>) and a per-minute budget; others must not have one", () => {
    const ok = { id: "mcp-issues", method: "POST", match: { kind: "exact", path: "/mcp/issues" }, upstream: "mcp", mcp: { target: "http://mandat-mcp-r_x-issues:8080", per_min: 60 } };
    expect(GateRouteSchema.safeParse(ok).success).toBe(true);
    // the sidecar's name carries the run id (a ULID, upper case)
    expect(GateRouteSchema.safeParse({ ...ok, mcp: { target: "http://mandat-mcp-r_01M5J8Z8WAZR4N0TBGC94C4A66-probe:8080", per_min: 60 } }).success).toBe(true);
    expect(GateRouteSchema.safeParse({ ...ok, mcp: undefined }).success).toBe(false);
    expect(GateRouteSchema.safeParse({ ...ok, mcp: { target: "https://evil.example.com", per_min: 60 } }).success).toBe(false);
    expect(GateRouteSchema.safeParse({ ...LLM[0], mcp: ok.mcp }).success).toBe(false);
  });
  it("forwards /mcp/<name> to the sidecar's /mcp; over the budget → 429 and a proxy_block line", async () => {
    let seen = "";
    const up = await stub((req, res) => {
      seen = req.url ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
    const route = (method: "POST" | "GET") => ({ id: `mcp-issues-${method}`, method, match: { kind: "exact" as const, path: "/mcp/issues" }, upstream: "mcp" as const, mcp: { target: up.url, per_min: 2 } });
    const { base, lines } = await gate(pol("agent", [route("POST"), route("GET")]));
    const post = () => fetch(`${base}/mcp/issues`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await post()).status).toBe(200);
    expect(seen).toBe("/mcp");
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
    expect(up.calls()).toBe(2);
    await waitFor(() => lines().some((l) => l.kind === "proxy_block" && l.status === 429));
  });
});
