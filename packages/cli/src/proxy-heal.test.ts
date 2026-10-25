import { mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import type net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasSealedKeys, proxyLocked } from "./commands/proxy-heal.js";

async function serve(status: number, body: unknown): Promise<{ port: number; close(): void }> {
  const s = http.createServer((_q, r) => r.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body)));
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return { port: (s.address() as net.AddressInfo).port, close: () => s.close() };
}

describe("proxy heal (E7в, AC-3.8)", () => {
  it("locked, unhealthy or absent → true; unlocked → false", async () => {
    const a = await serve(200, { ok: true, locked: true });
    const b = await serve(200, { ok: true, locked: false });
    const c = await serve(500, {});
    expect(await proxyLocked(a.port)).toBe(true);
    expect(await proxyLocked(b.port)).toBe(false);
    expect(await proxyLocked(c.port)).toBe(true);
    for (const x of [a, b, c]) x.close();
    expect(await proxyLocked(1)).toBe(true);
  });
  it("sealed keys present or not", () => {
    const h = mkdtempSync(path.join(tmpdir(), "heal-"));
    expect(hasSealedKeys(h)).toBe(false);
    writeFileSync(path.join(h, "keys.sealed.json"), "{}");
    expect(hasSealedKeys(h)).toBe(true);
  });
});

describe("realDeps().bootProxy (D-345)", () => {
  it("204 → true; anything else or no server → false; the token goes as a bearer, the keys as JSON", async () => {
    const { realDeps } = await import("./deps.js");
    const seen: { auth: string | undefined; body: string }[] = [];
    const s = http.createServer((q, r) => {
      let b = "";
      q.on("data", (c: Buffer) => (b += c.toString()));
      q.on("end", () => {
        seen.push({ auth: q.headers.authorization, body: b });
        r.writeHead(seen.length === 1 ? 204 : 401).end();
      });
    });
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
    const port = (s.address() as net.AddressInfo).port;
    const d = realDeps();
    expect(await d.bootProxy(port, "mdt_boot_x", { anthropic: "k".repeat(20) })).toBe(true);
    expect(await d.bootProxy(port, "mdt_boot_x", { anthropic: "k".repeat(20) })).toBe(false);
    expect(seen[0]).toEqual({ auth: "Bearer mdt_boot_x", body: JSON.stringify({ anthropic: "k".repeat(20) }) });
    s.close();
    expect(await d.bootProxy(1, "t", { anthropic: "k" })).toBe(false);
  });
});
