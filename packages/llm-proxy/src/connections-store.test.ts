import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConnectionStore } from "./connections-store.js";

// D-392: the saved connections of `mandat local` — metadata in $MANDAT_HOME/connections.json (0600), each key sealed in
// keys.sealed.json under conn:<id> (AES-GCM, the provider name as associated data). The worker reads metadata only.
const KEY = ["sk", "ds", randomBytes(24).toString("base64url")].join("-");
const home = () => mkdtempSync(path.join(tmpdir(), "conns-"));
const kek = randomBytes(32);
const ds = { id: "deepseek", provider: "deepseek" as const, label: "DeepSeek", baseUrl: "https://api.deepseek.com/anthropic", models: ["deepseek-v4-pro", "deepseek-flash"], defaultModel: "deepseek-v4-pro" };

describe("ConnectionStore (D-392)", () => {
  it("put → list: the key is sealed apart, the file is 0600 and never holds the key", () => {
    const h = home();
    const s = new ConnectionStore(h, kek);
    s.put(ds, KEY);
    expect(s.list()).toEqual([{ ...ds, hasKey: true }]);
    const file = readFileSync(path.join(h, "connections.json"), "utf8");
    expect(file).not.toContain(KEY);
    expect(readFileSync(path.join(h, "keys.sealed.json"), "utf8")).not.toContain(KEY);
    expect(statSync(path.join(h, "connections.json")).mode & 0o777).toBe(0o600);
    expect(s.key("deepseek")).toBe(KEY);
    expect(new ConnectionStore(h).list()).toEqual([{ ...ds, hasKey: true }]); // metadata without the KEK (the worker)
    expect(() => new ConnectionStore(h).key("deepseek")).toThrow();
  });
  it("setModels changes the list and the default; remove drops the key too", () => {
    const s = new ConnectionStore(home(), kek);
    s.put(ds, KEY);
    s.setModels("deepseek", { models: ["deepseek-flash"], defaultModel: "deepseek-flash" });
    expect(s.get("deepseek")).toMatchObject({ models: ["deepseek-flash"], defaultModel: "deepseek-flash" });
    expect(s.setModels("nope", { models: ["m"], defaultModel: "m" })).toBe(false);
    s.remove("deepseek");
    expect(s.list()).toEqual([]);
    expect(s.key("deepseek")).toBeNull();
  });
  it("upstreams: the proxy boot payload — key-taking and local connections, never subscriptions; local costs 0", () => {
    const s = new ConnectionStore(home(), kek);
    s.put(ds, KEY);
    s.put({ id: "ollama", provider: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434", models: ["qwen3-coder"], defaultModel: "qwen3-coder" });
    s.put({ id: "lichno", provider: "claude-sub", label: "Claude", baseUrl: null, models: ["claude-sonnet-5-5"], defaultModel: "claude-sonnet-5-5" });
    expect(s.upstreams()).toEqual({
      deepseek: { wire: "anthropic", url: "https://api.deepseek.com/anthropic", auth: "x-api-key", key: KEY, models: ["deepseek-v4-pro", "deepseek-flash"], prices: {} },
      ollama: { wire: "anthropic", url: "http://host.docker.internal:11434", auth: "none", key: "", models: ["qwen3-coder"], prices: { "qwen3-coder": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } },
    });
  });
  it("preferences: the default agent and model survive a restart; a broken file reads as empty", () => {
    const h = home();
    const s = new ConnectionStore(h, kek);
    expect(s.prefs()).toEqual({ defaultAgent: null, defaultModel: null, onboarded: false });
    s.setPrefs({ defaultAgent: "claude+deepseek", defaultModel: "deepseek-v4-pro", onboarded: true });
    expect(new ConnectionStore(h).prefs()).toMatchObject({ defaultAgent: "claude+deepseek", onboarded: true });
    writeFileSync(path.join(h, "connections.json"), "{not json");
    expect(new ConnectionStore(h).list()).toEqual([]);
  });
  it("an invalid connection is refused before anything is written", () => {
    const s = new ConnectionStore(home(), kek);
    expect(() => s.put({ ...ds, defaultModel: "other" }, KEY)).toThrow();
    expect(() => s.put({ ...ds, id: "Bad" }, KEY)).toThrow();
    expect(s.list()).toEqual([]);
  });
});
