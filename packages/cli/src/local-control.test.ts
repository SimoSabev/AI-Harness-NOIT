import { describe, expect, it } from "vitest";
import { startControl } from "./commands/local-control.js";
import type { Keys } from "./commands/local-control.js";

// D-293: the keys reach the proxy through `mandat local` only: 127.0.0.1, a bearer token, never echoed, never stored.
describe("mandat local control (D-293)", () => {
  it("token, validation, start/stop/status; the key is never in a response", async () => {
    const anthropic = ["sk", "ant", "api03", "q".repeat(40)].join("-");
    const got: Keys[] = [];
    let providers: string[] | null = null;
    const c = await startControl({
      start: async (k) => {
        got.push(k);
        providers = k.openai ? ["anthropic", "openai"] : ["anthropic"];
        return true;
      },
      stop: async () => {
        providers = null;
      },
      providers: async () => providers,
    });
    try {
      expect(c.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const call = (method: string, body?: unknown, token = c.token) =>
        fetch(`${c.url}/keys`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      expect((await call("GET", undefined, "x".repeat(64))).status).toBe(401);
      expect(await (await call("GET")).json()).toEqual({ proxy: "stopped", providers: [] });
      expect((await call("POST", { anthropic: "short" })).status).toBe(400);
      expect((await call("POST", { anthropic, extra: 1 })).status).toBe(400);
      const r = await call("POST", { anthropic });
      const text = await r.text();
      expect(r.status).toBe(200);
      expect(text).not.toContain(anthropic);
      expect(JSON.parse(text)).toEqual({ proxy: "running", providers: ["anthropic"] });
      expect(got).toEqual([{ anthropic }]);
      expect(await (await call("DELETE")).json()).toEqual({ proxy: "stopped", providers: [] });
      expect((await fetch(`${c.url}/other`, { headers: { authorization: `Bearer ${c.token}` } })).status).toBe(404);
    } finally {
      await c.close();
    }
  });
  it("a failed proxy start → 502 proxy_start_failed", async () => {
    const c = await startControl({ start: async () => false, stop: async () => undefined, providers: async () => null });
    try {
      const r = await fetch(`${c.url}/keys`, { method: "POST", headers: { authorization: `Bearer ${c.token}` }, body: JSON.stringify({ anthropic: "a".repeat(40) }) });
      expect([r.status, await r.json()]).toEqual([502, { error: "proxy_start_failed" }]);
    } finally {
      await c.close();
    }
  });
});
