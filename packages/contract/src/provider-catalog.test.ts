import { describe, expect, it } from "vitest";
import { AddConnectionBody, Connection, ModelId, PROVIDERS, ProxyUpstream } from "./connections.js";
import { CATALOG, KeyCheck, ProviderEntry, agentFor, keyHint, nextConnectionId, providerGroups } from "./provider-catalog.js";

// D-470: the providers as data — one zod-checked record per provider; the proxy picks the wire by the record's format,
// the web shows which agent can use it. A key never appears here; a connection carries only its last four characters.
describe("provider catalog (D-470)", () => {
  it("every record passes the schema, ids are unique and PROVIDERS is built from the records", () => {
    const ids = CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CATALOG) {
      expect(ProviderEntry.safeParse(p).success).toBe(true);
      expect(PROVIDERS[p.id]).toEqual(p);
    }
    expect(Object.keys(PROVIDERS).sort()).toEqual([...ids].sort());
  });
  it("covers the providers people use, local servers and any OpenAI-compatible address", () => {
    for (const id of ["anthropic", "openai", "gemini", "xai", "mistral", "deepseek", "qwen", "kimi", "zai", "minimax", "ernie", "doubao", "hunyuan", "openrouter", "groq", "together", "fireworks", "cerebras", "perplexity", "cohere", "azure", "bedrock", "vertex", "ollama", "lmstudio", "vllm", "openai-compat", "custom"] as const) {
      expect(PROVIDERS[id], id).toBeDefined();
    }
  });
  it("the agent follows the format: Anthropic → Claude Code, OpenAI Responses → Codex, Gemini → Gemini CLI, anything else → none (shown honestly)", () => {
    for (const p of CATALOG) {
      const want = p.wire === "anthropic" ? "claude" : p.wire === "openai" ? "codex" : p.wire === "gemini" ? "gemini" : null;
      expect([p.id, agentFor(p.id)]).toEqual([p.id, want]);
      expect(p.agent).toBe(want);
    }
    expect(agentFor("anthropic")).toBe("claude");
    expect(agentFor("openai")).toBe("codex");
    expect(agentFor("gemini")).toBe("gemini");
  });
  it("docs links carry the date they were read; suggested models are valid ids, at most one recommended", () => {
    for (const p of CATALOG) {
      expect(p.docs).toMatch(/^https:\/\//);
      expect(p.checked).toMatch(/^2026-\d\d-\d\d$/);
      for (const m of p.models) expect(ModelId.safeParse(m.id).success).toBe(true);
      expect(p.models.filter((m) => m.recommended).length).toBeLessThanOrEqual(1);
      if (p.kind === "api_key" && p.keyPage !== null) expect(p.keyPage).toMatch(/^https:\/\//);
    }
  });
  it("a key-taking provider that an agent can use suggests at least one model (the person does not have to know names)", () => {
    for (const p of CATALOG.filter((x) => x.kind === "api_key" && x.agent !== null && x.baseUrl !== null)) expect(p.models.length, p.id).toBeGreaterThan(0);
  });
  it("groups put every provider in exactly one place on the page", () => {
    const all = providerGroups().flatMap((g) => g.ids);
    expect([...all].sort()).toEqual(CATALOG.map((p) => p.id).sort());
  });
});

describe("several keys per provider, each with a label (D-471)", () => {
  it("nextConnectionId: the provider id first, then -2, -3 …", () => {
    expect(nextConnectionId("anthropic", [])).toBe("anthropic");
    expect(nextConnectionId("anthropic", ["anthropic"])).toBe("anthropic-2");
    expect(nextConnectionId("anthropic", ["anthropic", "anthropic-2", "deepseek"])).toBe("anthropic-3");
    expect(nextConnectionId("openai-compat", ["openai-compat"])).toBe("openai-compat-2");
  });
  it("keyHint: only the last four characters, never more", () => {
    const key = ["sk", "ant", "0123456789abcdefWXYZ"].join("-");
    expect(keyHint(key)).toBe("WXYZ");
    expect(keyHint(`  ${key}  `)).toBe("WXYZ");
  });
  it("a connection may carry its hint and the last check; nothing else about the key", () => {
    const c = { id: "anthropic-2", provider: "anthropic", label: "Work", baseUrl: "https://api.anthropic.com", models: ["claude-sonnet-5-5"], defaultModel: "claude-sonnet-5-5", hasKey: true };
    expect(Connection.safeParse({ ...c, keyHint: "WXYZ", check: { status: "ok", at: "2026-11-04T10:00:00.000Z" } }).success).toBe(true);
    expect(Connection.safeParse({ ...c, keyHint: "WXYZ1" }).success).toBe(false);
    expect(Connection.safeParse({ ...c, key: "x".repeat(30) }).success).toBe(false);
    expect(Connection.safeParse({ ...c, check: { status: "maybe", at: "2026-11-04T10:00:00.000Z" } }).success).toBe(false);
  });
  it("the check has four plain results", () => {
    expect(KeyCheck.options).toEqual(["ok", "bad_key", "no_credit", "unreachable"]);
  });
  it("AddConnectionBody: any id and label for a second key of the same provider; providers no agent can use can still be saved", () => {
    const key = ["sk", "0123456789abcdefghij"].join("-");
    expect(AddConnectionBody.safeParse({ provider: "anthropic", id: "anthropic-2", label: "Work", key, models: ["claude-sonnet-5-5"] }).success).toBe(true);
    expect(AddConnectionBody.safeParse({ provider: "mistral", key, models: ["m1"] }).success).toBe(true);
    expect(AddConnectionBody.safeParse({ provider: "openai-compat", key, models: ["m1"] }).success).toBe(false); // needs the address
    expect(AddConnectionBody.safeParse({ provider: "openai-compat", baseUrl: "https://llm.example.com/v1", key, models: ["m1"] }).success).toBe(true);
  });
  it("the proxy boot payload only takes the wires the proxy speaks", () => {
    const u = { url: "https://api.x.ai", auth: "bearer", key: "k".repeat(24), models: ["m1"], prices: {} };
    expect(ProxyUpstream.safeParse({ ...u, wire: "openai" }).success).toBe(true);
    expect(ProxyUpstream.safeParse({ ...u, wire: "openai-chat" }).success).toBe(false);
    expect(ProxyUpstream.safeParse({ ...u, wire: "openai", auth: "api-key" }).success).toBe(true); // Azure
  });
});
