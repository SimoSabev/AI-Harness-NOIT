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
    expect(s.list()).toEqual([{ ...ds, hasKey: true, keyHint: KEY.slice(-4) }]);
    const file = readFileSync(path.join(h, "connections.json"), "utf8");
    expect(file).not.toContain(KEY);
    expect(readFileSync(path.join(h, "keys.sealed.json"), "utf8")).not.toContain(KEY);
    if (process.platform !== "win32") expect(statSync(path.join(h, "connections.json")).mode & 0o777).toBe(0o600); // no POSIX modes on Windows: the profile ACL guards the file (D-454, D-511)
    expect(s.key("deepseek")).toBe(KEY);
    expect(new ConnectionStore(h).list()).toEqual([{ ...ds, hasKey: true, keyHint: KEY.slice(-4) }]); // metadata without the KEK (the worker)
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
      ollama: { wire: "anthropic", url: "http://host.docker.internal:11434", auth: "none", key: "", models: ["qwen3-coder"], prices: { "qwen3-coder": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }, local: true },
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

// D-471: several keys per provider (each its own connection, its own label, sealed under conn:<id>); the metadata keeps
// only the last four characters and the last check (D-472). The full key is never in connections.json.
describe("ConnectionStore: several keys, the hint and the check (D-471, D-472)", () => {
  const KEY2 = ["sk", "ant", randomBytes(24).toString("base64url")].join("-");
  const an = (id: string, label: string) => ({ id, provider: "anthropic" as const, label, baseUrl: "https://api.anthropic.com", models: ["claude-sonnet-5-5"], defaultModel: "claude-sonnet-5-5" });
  it("a second Anthropic key is its own connection and its own proxy upstream; the first keeps the old key name", () => {
    const h = home();
    const s = new ConnectionStore(h, kek);
    s.put(an("anthropic", "Personal"), KEY);
    s.put(an("anthropic-2", "Work"), KEY2);
    expect(s.list().map((c) => [c.id, c.label, c.keyHint])).toEqual([["anthropic", "Personal", KEY.slice(-4)], ["anthropic-2", "Work", KEY2.slice(-4)]]);
    expect(s.key("anthropic")).toBe(KEY);
    expect(s.key("anthropic-2")).toBe(KEY2);
    expect(Object.keys(JSON.parse(readFileSync(path.join(h, "keys.sealed.json"), "utf8")) as object).sort()).toEqual(["anthropic", "conn:anthropic-2"]);
    const ups = s.upstreams();
    expect(Object.keys(ups)).toEqual(["anthropic-2"]); // the first one stays the plain `claude` key
    expect(ups["anthropic-2"]).toMatchObject({ wire: "anthropic", url: "https://api.anthropic.com", auth: "x-api-key", key: KEY2 });
    for (const f of ["connections.json"]) {
      const text = readFileSync(path.join(h, f), "utf8");
      expect([text.includes(KEY), text.includes(KEY2)]).toEqual([false, false]);
    }
  });
  it("setCheck keeps the last check; a new key clears it", () => {
    const s = new ConnectionStore(home(), kek);
    s.put(an("anthropic-2", "Work"), KEY2);
    expect(s.setCheck("anthropic-2", { status: "no_credit", at: "2026-11-04T10:00:00.000Z" })).toBe(true);
    expect(s.get("anthropic-2")?.check).toEqual({ status: "no_credit", at: "2026-11-04T10:00:00.000Z" });
    expect(s.setCheck("nobody", { status: "ok", at: "2026-11-04T10:00:00.000Z" })).toBe(false);
    s.put(an("anthropic-2", "Work"), KEY);
    expect(s.get("anthropic-2")?.check).toBeUndefined();
    expect(s.get("anthropic-2")?.keyHint).toBe(KEY.slice(-4));
  });
  it("setModels keeps the hint and the check", () => {
    const s = new ConnectionStore(home(), kek);
    s.put(an("anthropic-2", "Work"), KEY2);
    s.setCheck("anthropic-2", { status: "ok", at: "2026-11-04T10:00:00.000Z" });
    s.setModels("anthropic-2", { models: ["claude-opus-5-5"], defaultModel: "claude-opus-5-5" });
    expect(s.get("anthropic-2")).toMatchObject({ keyHint: KEY2.slice(-4), check: { status: "ok" } });
  });
  it("a provider no agent can use is saved (and checkable) but never becomes a proxy upstream", () => {
    const s = new ConnectionStore(home(), kek);
    s.put({ id: "cerebras", provider: "cerebras", label: "Cerebras", baseUrl: "https://api.cerebras.ai", models: ["gpt-oss-120b"], defaultModel: "gpt-oss-120b" }, KEY);
    expect(s.get("cerebras")?.hasKey).toBe(true);
    expect(s.upstreams()).toEqual({});
  });
  it("Azure goes through the proxy with its api-key header", () => {
    const s = new ConnectionStore(home(), kek);
    s.put({ id: "azure", provider: "azure", label: "Azure", baseUrl: "https://acme.openai.azure.com/openai", models: ["gpt-5"], defaultModel: "gpt-5" }, KEY);
    expect(s.upstreams().azure).toMatchObject({ wire: "openai", auth: "api-key", url: "https://acme.openai.azure.com/openai", key: KEY });
  });
});
