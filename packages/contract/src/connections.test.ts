import { AGENT_CLIS, KEY_CLIS } from "./agent-cli.js";
import { describe, expect, it } from "vitest";
import {
  AddConnectionBody, Connection, ConnectionId, ConnectionsReply, ModelId, PROVIDERS, Preferences, ProxyUpstream, agentOf, connectionLabel, formatAgentRef, parseAgentRef,
  priceOf, providerInfo, upstreamUrl,
} from "./connections.js";

// D-392: one "connection" per way of reaching a model — a subscription, an API key, a local server or another endpoint
// that speaks the Anthropic (or OpenAI Responses) API. Only names, addresses and model ids cross here; a key never does.
describe("connections: catalog (D-392)", () => {
  it("every provider has a docs link with the date it was checked, and every suggested model is a valid id", () => {
    for (const p of Object.values(PROVIDERS)) {
      expect(p.docs).toMatch(/^https:\/\//);
      expect(p.checked).toMatch(/^\d{4}-\d\d-\d\d$/);
      for (const m of p.models) expect(ModelId.safeParse(m.id).success).toBe(true);
      expect(p.models.filter((m) => m.recommended).length).toBeLessThanOrEqual(1);
    }
  });
  it("subscriptions run the unmodified CLI with its own login; keys and local servers go through the proxy", () => {
    expect(PROVIDERS["claude-sub"]).toMatchObject({ kind: "subscription", agent: "claude" });
    expect(PROVIDERS["chatgpt-sub"]).toMatchObject({ kind: "subscription", agent: "codex", wire: "openai" });
    expect(PROVIDERS.deepseek).toMatchObject({ kind: "api_key", agent: "claude", wire: "anthropic", baseUrl: "https://api.deepseek.com/anthropic" });
    expect(PROVIDERS.ollama).toMatchObject({ kind: "local", auth: "none", baseUrl: "http://127.0.0.1:11434" });
    expect(providerInfo("custom").baseUrl).toBeNull();
  });
  it("prices: known per model, zero for a local server, null (= estimate) for an unknown remote model", () => {
    expect(priceOf("anthropic", "claude-opus-5-5")).toMatchObject({ input: 4, output: 20 });
    expect(priceOf("ollama", "qwen3-coder")).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(priceOf("custom", "whatever-1")).toBeNull();
  });
});

// D-095: key-looking values are built at runtime, never literals
const KEY = ["sk", "0123456789abcdefghij"].join("-");

describe("connections: ids, models, addresses (D-392)", () => {
  it("ids are the profile alphabet; model ids allow the forms providers use (qwen3-coder:30b, org/model, glm-5.2[1m])", () => {
    expect(ConnectionId.safeParse("deepseek").success).toBe(true);
    for (const bad of ["", "Deep", "-x", "a b", "a".repeat(33)]) expect(ConnectionId.safeParse(bad).success).toBe(false);
    for (const ok of ["claude-sonnet-5-5", "qwen3-coder:30b", "moonshotai/kimi-k3", "glm-5.2[1m]", "k3.1-pro"]) expect(ModelId.safeParse(ok).success).toBe(true);
    for (const bad of ["", " x", "a b", "x;rm", "mdt_abc", ["sk", "ant", "api03", "xyz"].join("-"), "a".repeat(129)]) expect(ModelId.safeParse(bad).success).toBe(false);
  });
  it("upstreamUrl: https for a remote host; http only for this computer, which the proxy container reaches as host.docker.internal", () => {
    expect(upstreamUrl("https://api.deepseek.com/anthropic/")).toEqual({ ok: true, url: "https://api.deepseek.com/anthropic", local: false });
    expect(upstreamUrl("http://localhost:11434")).toEqual({ ok: true, url: "http://host.docker.internal:11434", local: true });
    expect(upstreamUrl("http://127.0.0.1:1234/")).toEqual({ ok: true, url: "http://host.docker.internal:1234", local: true });
    for (const bad of ["http://api.example.com", "ftp://x", "https://user:pw@x.com", "https://x.com/?a=1", "https://x.com/#f", "not a url", "https://169.254.169.254", "http://10.0.0.5:11434"]) {
      expect(upstreamUrl(bad).ok).toBe(false);
    }
  });
  it("a connection: models non-empty, the default is one of them", () => {
    const c = { id: "deepseek", provider: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/anthropic", models: ["deepseek-v4-pro", "deepseek-flash"], defaultModel: "deepseek-v4-pro", hasKey: true };
    expect(Connection.safeParse(c).success).toBe(true);
    expect(Connection.safeParse({ ...c, defaultModel: "other" }).success).toBe(false);
    expect(Connection.safeParse({ ...c, models: [] }).success).toBe(false);
  });
  it("AddConnectionBody: a key only for a provider that takes one; it never comes back in Connection", () => {
    expect(AddConnectionBody.safeParse({ provider: "deepseek", key: KEY, models: ["deepseek-v4-pro"] }).success).toBe(true);
    expect(AddConnectionBody.safeParse({ provider: "ollama", key: KEY, models: ["qwen3-coder"] }).success).toBe(false);
    expect(AddConnectionBody.safeParse({ provider: "deepseek", models: ["deepseek-v4-pro"] }).success).toBe(false);
    expect(AddConnectionBody.safeParse({ provider: "custom", key: "k".repeat(24), models: ["m1"] }).success).toBe(false); // custom needs an address
    expect(Object.keys(Connection.shape)).not.toContain("key");
  });
  it("ProxyUpstream: the boot payload of one connection (the key goes to the proxy only)", () => {
    expect(ProxyUpstream.safeParse({ wire: "anthropic", url: "https://api.deepseek.com/anthropic", auth: "x-api-key", key: "k".repeat(24), models: ["deepseek-v4-pro"], prices: {} }).success).toBe(true);
    expect(ProxyUpstream.safeParse({ wire: "anthropic", url: "http://evil.example", auth: "none", key: "", models: ["m"], prices: {} }).success).toBe(false);
  });
  it("Preferences: the default agent and model of the task box", () => {
    expect(Preferences.parse({}).defaultAgent).toBeNull();
    expect(Preferences.safeParse({ defaultAgent: "claude+deepseek", defaultModel: "deepseek-v4-pro" }).success).toBe(true);
  });
});

// D-427: Google Gemini with an API key — Gemini CLI, the Gemini API wire, the key in x-goog-api-key (through the proxy)
describe("Google Gemini provider (D-427)", () => {
  it("api_key, agent gemini, wire gemini; models with prices; the key page is Google AI Studio", () => {
    expect(PROVIDERS.gemini).toMatchObject({ id: "gemini", label: "Google Gemini", kind: "api_key", agent: "gemini", wire: "gemini", baseUrl: "https://generativelanguage.googleapis.com", auth: "x-goog-api-key", keyPage: "https://aistudio.google.com/apikey" });
    expect(PROVIDERS.gemini.models.map((m) => [m.id, m.tier])).toEqual([["gemini-3.8-flash", "balanced"], ["gemini-4-argon", "best"], ["gemini-3.5-flash-lite", "fast"]]);
    expect(PROVIDERS.gemini.models.find((m) => m.recommended)?.id).toBe("gemini-3.8-flash");
    expect(priceOf("gemini", "gemini-4-argon")).toEqual({ input: 4, output: 20, cacheRead: 0.2, cacheWrite: 4 });
  });
  it("gemini, gemini+<connection> and a Google login gemini@<account> parse (the registry decides whether it may run, D-464)", () => {
    for (const s of ["gemini", "gemini+gemini", "gemini+rabota", "gemini@lichno"]) expect(formatAgentRef(parseAgentRef(s)!)).toBe(s);
    expect(agentOf("gemini+rabota")).toBe("gemini");
    expect(AddConnectionBody.safeParse({ provider: "gemini", key: KEY, models: ["gemini-3.8-flash"] }).success).toBe(true);
    expect(AddConnectionBody.safeParse({ provider: "gemini", models: ["gemini-3.8-flash"] }).success).toBe(false);
    expect(ProxyUpstream.safeParse({ wire: "gemini", url: "https://generativelanguage.googleapis.com", auth: "x-goog-api-key", key: KEY, models: ["gemini-3.8-flash"], prices: {} }).success).toBe(true);
  });
});

describe("agent refs (D-392)", () => {
  it("parse and format round-trip every form", () => {
    for (const s of ["claude", "codex", "claude@lichno", "codex@rabota", "claude+deepseek", "codex+openrouter", "fake:honest-fix", "fake-codex:delete-test"]) {
      const r = parseAgentRef(s);
      expect(r).not.toBeNull();
      expect(formatAgentRef(r!)).toBe(s);
    }
    for (const bad of ["", "gemin", "claude@", "claude+", "claude@A", "claude+x+y", "codex@a b"]) expect(parseAgentRef(bad)).toBeNull();
  });
  it("D-464: every subscription CLI signs in as <cli>@<account>; only claude, codex and gemini have a key or a connection", () => {
    for (const cli of ["copilot", "kimi", "antigravity", "cursor", "minimax"]) {
      expect(formatAgentRef(parseAgentRef(`${cli}@lichno`)!)).toBe(`${cli}@lichno`);
      expect(agentOf(`${cli}@lichno`)).toBe(cli);
      expect(parseAgentRef(cli)).toBeNull();
      expect(parseAgentRef(`${cli}+deepseek`)).toBeNull();
    }
    expect(AGENT_CLIS).toEqual(["claude", "codex", "gemini", "copilot", "kimi", "antigravity", "cursor", "minimax"]);
    expect(KEY_CLIS).toEqual(["claude", "codex", "gemini"]);
  });
  it("agentOf and connectionLabel: which CLI runs and the channel label the worker resolves", () => {
    expect(agentOf("claude+deepseek")).toBe("claude");
    expect(agentOf("codex@rabota")).toBe("codex");
    expect(connectionLabel("deepseek")).toBe("conn-deepseek");
  });
});

describe("device codes of every provider (D-464)", () => {
  it("Kimi prints its page with the code in the address and as `code: …` on stderr", async () => {
    const { findDeviceLogin } = await import("./local-control.js");
    const out = "Opening browser for Kimi device login: https://www.kimi.ai/code/authorize_device?user_code=QX7K2M\nIf the browser did not open, paste the URL above and enter code: QX7K2M\nCode expires in 1800s.\n";
    expect(findDeviceLogin(out)).toEqual({ url: "https://www.kimi.ai/code/authorize_device?user_code=QX7K2M", code: "QX7K2M" });
    expect(findDeviceLogin("see https://evil.example/code?user_code=QX7K2M code: QX7K2M")).toBeNull();
  });
});

describe("ChatGPT sign-in and the connections reply (D-393)", () => {
  it("the device page must be OpenAI's own (https, no user, no port); the code is the short one-time code", async () => {
    const { isDeviceUrl, findDeviceLogin } = await import("./local-control.js");
    expect(isDeviceUrl("https://auth.openai.com/codex/device")).toBe(true);
    for (const bad of ["http://auth.openai.com/codex/device", "https://auth.openai.com.evil.example/codex/device", "https://u@auth.openai.com/codex/device", "https://evil.example/device"]) expect(isDeviceUrl(bad)).toBe(false);
    const out = "Follow these steps to sign in with ChatGPT using device code authorization:\n\n1. Open this link in your browser and sign in to your account\n   \x1b[94mhttps://auth.openai.com/codex/device\x1b[0m\n\n2. Enter this one-time code (expires in 15 minutes)\n   \x1b[94mABCD-12EFG\x1b[0m\n";
    expect(findDeviceLogin(out)).toEqual({ url: "https://auth.openai.com/codex/device", code: "ABCD-12EFG" });
    expect(findDeviceLogin("1. Open this link https://auth.openai.com/codex/device\n")).toBeNull();
  });
  it("LoginState: waiting_device carries the address and the code; a start names the CLI", async () => {
    const { LoginState, LoginStart } = await import("./local-control.js");
    expect(LoginState.safeParse({ state: "waiting_device", name: "rabota", url: "https://auth.openai.com/codex/device", code: "ABCD-12EFG" }).success).toBe(true);
    expect(LoginState.safeParse({ state: "waiting_device", name: "rabota", url: "https://evil.example/x", code: "ABCD-12EFG" }).success).toBe(false);
    expect(LoginStart.parse({ name: "rabota" })).toEqual({ name: "rabota", cli: "claude" });
    expect(LoginStart.safeParse({ name: "rabota", cli: "codex" }).success).toBe(true);
    expect(LoginStart.safeParse({ name: "rabota", cli: "gemini" }).success).toBe(false);
  });
  it("ConnectionsReply: connections + preferences, nothing else", () => {
    expect(ConnectionsReply.safeParse({ connections: [], preferences: { defaultAgent: null, defaultModel: null, onboarded: false } }).success).toBe(true);
    expect(ConnectionsReply.safeParse({ connections: [], preferences: {}, keys: {} }).success).toBe(false);
  });
});
