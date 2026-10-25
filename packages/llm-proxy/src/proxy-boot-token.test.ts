import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { bootTokenHash, createProxyServer, mintBootToken, mintTaskToken } from "./index.js";

const secret = randomBytes(32);
const REAL_KEY = ["sk", "ant", "api03", randomBytes(30).toString("base64url")].join("-");
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
async function upstream() {
  const seen: string[] = [];
  const s = http.createServer((req, res) => {
    seen.push(String(req.headers["x-api-key"] ?? ""));
    req.resume();
    req.on("end", () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } })));
  });
  return { url: await listen(s), seen };
}
async function locked(token: string, o: { now?: number; spentFile?: string } = {}) {
  const up = await upstream();
  const dir = mkdtempSync(path.join(tmpdir(), "boot-"));
  const p = createProxyServer({
    secret, apiKey: "", upstream: up.url, usageLogPath: path.join(dir, "usage.jsonl"), now: () => (o.now ?? NOW) * 1000, log: () => undefined,
    boot: { tokenHash: bootTokenHash(token), expiresAtMs: (NOW + 60) * 1000, spentFile: o.spentFile ?? path.join(dir, "boot-spent") },
  });
  return { up, inf: await listen(p.inference), adm: await listen(p.admin), dir };
}
const msg = JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1, messages: [] });
const task = () => mintTaskToken(secret, { t: "t_x", r: `r_${ulid()}`, a: 1, e: NOW + 600, b: 1, n: "aa" });

describe("proxy boot token (E7в, D-313/D-345)", () => {
  it("a boot token is mdt_boot_ + 43 url-safe chars", () => {
    expect(mintBootToken()).toMatch(/^mdt_boot_[A-Za-z0-9_-]{43}$/);
  });
  it("locked: healthz says so, inference → 503; after boot the real key reaches upstream", async () => {
    const t = mintBootToken();
    const p = await locked(t);
    expect(JSON.parse((await call(p.adm, "/healthz", { method: "GET" })).body)).toMatchObject({ ok: true, locked: true });
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": task() }, body: msg })).status).toBe(503);
    const b = await call(p.adm, "/admin/boot", { headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ anthropic: REAL_KEY }) });
    expect(b.status).toBe(204);
    expect(JSON.parse((await call(p.adm, "/healthz", { method: "GET" })).body)).toMatchObject({ locked: false, providers: ["anthropic"] });
    expect((await call(p.inf, "/v1/messages", { headers: { "x-api-key": task() }, body: msg })).status).toBe(200);
    expect(p.up.seen).toEqual([REAL_KEY]);
  });
  it("the token is one-time: a second exchange → 401; the spent mark survives a restart (same token → 401)", async () => {
    const t = mintBootToken();
    const p = await locked(t);
    const body = JSON.stringify({ anthropic: REAL_KEY });
    const h = { authorization: `Bearer ${t}`, "content-type": "application/json" };
    expect((await call(p.adm, "/admin/boot", { headers: h, body })).status).toBe(204);
    expect((await call(p.adm, "/admin/boot", { headers: h, body })).status).toBe(401);
    expect(readFileSync(path.join(p.dir, "boot-spent"), "utf8")).not.toContain(t);
    const again = await locked(t, { spentFile: path.join(p.dir, "boot-spent") });
    expect((await call(again.adm, "/admin/boot", { headers: h, body })).status).toBe(401);
  });
  it("an expired, wrong or missing token → 401; bad keys → 400 and the token is not spent", async () => {
    const t = mintBootToken();
    const late = await locked(t, { now: NOW + 61 });
    const body = JSON.stringify({ anthropic: REAL_KEY });
    expect((await call(late.adm, "/admin/boot", { headers: { authorization: `Bearer ${t}` }, body })).status).toBe(401);
    const p = await locked(t);
    expect((await call(p.adm, "/admin/boot", { headers: { authorization: `Bearer ${mintBootToken()}` }, body })).status).toBe(401);
    expect((await call(p.adm, "/admin/boot", { body })).status).toBe(401);
    expect((await call(p.adm, "/admin/boot", { headers: { authorization: `Bearer ${t}` }, body: JSON.stringify({ anthropic: "x" }) })).status).toBe(400);
    expect((await call(p.adm, "/admin/boot", { headers: { authorization: `Bearer ${t}` }, body })).status).toBe(204);
  });
});
