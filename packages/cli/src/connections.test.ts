import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConnectionStore } from "@mandat/llm-proxy";
import { Connections, checkKey, detectLocal } from "./commands/connections.js";

// D-393: the first-run page and Settings → Models talk to `mandat local` through these. A key is checked once against the
// provider (a list call, or a 1-token message when there is no list), sealed, and handed to the proxy — never echoed.
const KEY = ["sk", "ds", randomBytes(24).toString("base64url")].join("-");
type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };
function fakeFetch(answer: (c: Call) => number | Error | { status: number; json: unknown }) {
  const calls: Call[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? "GET", headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: init?.body as string | undefined };
    calls.push(c);
    const a = answer(c);
    if (a instanceof Error) throw a;
    const s = typeof a === "number" ? { status: a, json: {} } : a;
    return new Response(JSON.stringify(s.json), { status: s.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}

describe("checkKey (D-393)", () => {
  const ds = { wire: "anthropic" as const, base: "https://api.deepseek.com/anthropic", auth: "x-api-key" as const, key: KEY, model: "deepseek-v4-pro" };
  it("a list call with the key in its header; 401/403 → bad_key; a network error → unreachable", async () => {
    const ok = fakeFetch(() => 200);
    expect(await checkKey(ok.f, ds)).toBe("ok");
    expect(ok.calls[0]).toMatchObject({ url: "https://api.deepseek.com/anthropic/v1/models", method: "GET" });
    expect(ok.calls[0]?.headers["x-api-key"]).toBe(KEY);
    expect(await checkKey(fakeFetch(() => 401).f, ds)).toBe("bad_key");
    expect(await checkKey(fakeFetch(() => new Error("ECONNREFUSED")).f, ds)).toBe("unreachable");
  });
  it("no list endpoint (404) → one tiny message to the default model decides; bearer auth for Z.ai", async () => {
    const f = fakeFetch((c) => (c.method === "GET" ? 404 : 401));
    expect(await checkKey(f.f, { ...ds, auth: "bearer" })).toBe("bad_key");
    expect(f.calls[1]).toMatchObject({ url: "https://api.deepseek.com/anthropic/v1/messages", method: "POST" });
    expect(f.calls[1]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(f.calls[1]?.body ?? "{}")).toMatchObject({ model: "deepseek-v4-pro", max_tokens: 1 });
    expect(await checkKey(fakeFetch((c) => (c.method === "GET" ? 404 : 200)).f, ds)).toBe("ok");
  });
  it("a local server: any answer means it is there; no key header at all", async () => {
    const f = fakeFetch(() => 200);
    expect(await checkKey(f.f, { wire: "anthropic", base: "http://127.0.0.1:11434", auth: "none", key: "", model: "qwen3-coder" })).toBe("ok");
    expect(Object.keys(f.calls[0]?.headers ?? {}).some((h) => /key|authorization/i.test(h))).toBe(false);
  });
});

describe("detectLocal (D-393)", () => {
  it("Ollama's /api/tags and LM Studio's /v1/models on this computer; silent servers are skipped", async () => {
    const f = fakeFetch((c) => (c.url === "http://127.0.0.1:11434/api/tags" ? { status: 200, json: { models: [{ name: "qwen3-coder:latest" }, { name: "bad name" }] } } : new Error("refused")));
    expect(await detectLocal(f.f)).toEqual([{ provider: "ollama", models: ["qwen3-coder:latest"] }]);
    const both = fakeFetch((c) => (c.url.includes("11434") ? { status: 200, json: { models: [] } } : { status: 200, json: { data: [{ id: "qwen2.5-coder-7b" }] } }));
    expect(await detectLocal(both.f)).toEqual([{ provider: "ollama", models: [] }, { provider: "lmstudio", models: ["qwen2.5-coder-7b"] }]);
  });
});

describe("Connections (D-393)", () => {
  const make = (answer: (c: Call) => number | Error = () => 200, accounts: { name: string; cli: "claude" | "codex" }[] = []) => {
    const store = new ConnectionStore(mkdtempSync(path.join(tmpdir(), "c-")), randomBytes(32));
    let restarts = 0;
    const f = fakeFetch(answer);
    const c = new Connections({ store, fetch: f.f, restartProxy: async () => (restarts++, true), accounts: async () => accounts });
    return { c, store, calls: f.calls, restarts: () => restarts };
  };
  it("add: checked, saved with the key sealed, the proxy restarted; the reply has no key", async () => {
    const m = make();
    const r = await m.c.add({ provider: "deepseek", key: KEY, models: ["deepseek-v4-pro", "deepseek-flash"] });
    expect(r).toEqual({ ok: true, connection: { id: "deepseek", provider: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/anthropic", models: ["deepseek-v4-pro", "deepseek-flash"], defaultModel: "deepseek-v4-pro", hasKey: true } });
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(m.store.key("deepseek")).toBe(KEY);
    expect(m.restarts()).toBe(1);
  });
  it("add: a rejected key or a silent server saves nothing and restarts nothing", async () => {
    const bad = make(() => 403);
    expect(await bad.c.add({ provider: "deepseek", key: KEY, models: ["deepseek-v4-pro"] })).toEqual({ ok: false, error: "bad_key" });
    expect(bad.store.list()).toEqual([]);
    expect(bad.restarts()).toBe(0);
    const gone = make(() => new Error("refused"));
    expect(await gone.c.add({ provider: "ollama", models: ["qwen3-coder"] })).toEqual({ ok: false, error: "unreachable" });
  });
  it("the provider keys keep their names (anthropic, openai) so `claude` and `codex` keep working", async () => {
    const m = make();
    await m.c.add({ provider: "anthropic", key: ["sk", "ant", "x".repeat(30)].join("-"), models: ["claude-sonnet-5-5", "claude-opus-5-5"], defaultModel: "claude-opus-5-5" });
    expect(m.store.get("anthropic")).toMatchObject({ provider: "anthropic", defaultModel: "claude-opus-5-5", hasKey: true });
  });
  it("list: saved connections plus the subscription accounts with their catalog models; setModels saves an account's choice", async () => {
    const m = make(() => 200, [{ name: "lichno", cli: "claude" }, { name: "rabota", cli: "codex" }]);
    const l = await m.c.list();
    expect(l.connections.map((x) => [x.id, x.provider, x.defaultModel])).toEqual([["lichno", "claude-sub", "claude-sonnet-5-5"], ["rabota", "chatgpt-sub", "gpt-5-codex"]]);
    expect(await m.c.setModels("lichno", { models: ["claude-opus-5-5"], defaultModel: "claude-opus-5-5" })).toBe(true);
    expect(m.store.get("lichno")).toMatchObject({ provider: "claude-sub", defaultModel: "claude-opus-5-5" });
    expect(await m.c.setModels("nobody", { models: ["m"], defaultModel: "m" })).toBe(false);
  });
  it("remove: gone from the list, the proxy restarted", async () => {
    const m = make();
    await m.c.add({ provider: "ollama", models: ["qwen3-coder"] });
    await m.c.remove("ollama");
    expect((await m.c.list()).connections).toEqual([]);
    expect(m.restarts()).toBe(2);
  });
});
