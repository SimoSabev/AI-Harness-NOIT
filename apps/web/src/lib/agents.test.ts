import { describe, expect, it } from "vitest";
import { AGENTS, AGENT_IDS, agentChoices, agentHint, agentLabel, apiKeyUse, taskAgents } from "./agents";
import type { Connection } from "@mandat/contract";
import { CreateTaskBody } from "./server/actions";

// D-292: the minimal harness — real agents (key in the proxy) + demo agents (no key) that show each verdict.
describe("agents (D-292)", () => {
  it("claude/codex need a key; the demo agents are the fake scenarios with a fixed change", () => {
    expect(AGENT_IDS).toEqual(["claude", "codex", "fake:honest-fix", "fake:delete-test", "fake:skip-test", "fake:untested-extra"]);
    expect(AGENTS.filter((a) => a.needsKey).map((a) => a.id)).toEqual(["claude", "codex"]);
    for (const a of AGENTS) for (const lang of ["en", "bg"] as const) {
      expect(agentLabel(a.id, lang).length).toBeGreaterThan(0);
      expect(agentHint(a.id, lang).length).toBeGreaterThan(10);
    }
  });
  it("CreateTaskBody accepts every listed agent and nothing else", () => {
    for (const agent of AGENT_IDS) expect(CreateTaskBody.safeParse({ type: "bugfix", agent, text: "x" }).success).toBe(true);
    expect(CreateTaskBody.safeParse({ type: "bugfix", agent: "fake:r8-canary-leak", text: "x" }).success).toBe(false);
  });
  it("D-387: an optional repo id (a uuid) for the project picker", () => {
    expect(CreateTaskBody.safeParse({ type: "free", agent: "claude", text: "x", repo: "d0000000-0000-4000-8000-0000000000b1" }).success).toBe(true);
    expect(CreateTaskBody.safeParse({ type: "free", agent: "claude", text: "x", repo: "shop" }).success).toBe(false);
  });
  it("D-360: every task type, the free one too; nothing else", () => {
    for (const type of ["bugfix", "feature", "css", "docs", "free"]) expect(CreateTaskBody.safeParse({ type, agent: "claude", text: "x" }).success).toBe(true);
    expect(CreateTaskBody.safeParse({ type: "anything", agent: "claude", text: "x" }).success).toBe(false);
  });
  it("D-295: claude@<account> is accepted; a bad account name is not", () => {
    expect(CreateTaskBody.safeParse({ type: "bugfix", agent: "claude@work", text: "x" }).success).toBe(true);
    for (const agent of ["claude@", "claude@Work", "claude@a b", "gemini@x"]) expect(CreateTaskBody.safeParse({ type: "bugfix", agent, text: "x" }).success).toBe(false);
    expect(agentLabel("claude@work")).toBe("Claude Code · work");
  });
  it("agentLabel: known → label, unknown → the id itself", () => {
    expect(agentLabel("fake:delete-test")).toBe("Demo: deletes a test");
    expect(agentLabel("fake:delete-test", "bg")).toMatch(/трие тест/);
    expect(agentLabel("fake-codex:replay")).toBe("fake-codex:replay");
  });
});

// D-384: the picker shows only agents that can run now; the scripted demo agents only when asked for (MANDAT_DEMO_AGENTS).
describe("agentChoices (D-384)", () => {
  it("signed-in accounts first, then the agents whose key is set; nothing that cannot run", () => {
    expect(agentChoices({ accounts: ["claude@lichno"], keys: ["openai"], demo: false })).toEqual(["claude@lichno", "codex"]);
    expect(agentChoices({ accounts: [], keys: ["anthropic", "openai"], demo: false })).toEqual(["claude", "codex"]);
  });
  it("no account and no key: an empty list, never a demo agent in its place", () => {
    expect(agentChoices({ accounts: [], keys: [], demo: false })).toEqual([]);
  });
  it("the demo agents come last, and only with the demo switch", () => {
    expect(agentChoices({ accounts: ["claude@work"], keys: [], demo: true })).toEqual(["claude@work", "fake:honest-fix", "fake:delete-test", "fake:skip-test", "fake:untested-extra"]);
  });
});

// D-393: the task box offers every saved way of running an agent, each with its models; the remembered default first.
describe("taskAgents (D-393)", () => {
  const conns: Connection[] = [
    { id: "lichno", provider: "claude-sub", label: "lichno", baseUrl: null, models: ["claude-sonnet-5-5", "claude-opus-5-5"], defaultModel: "claude-opus-5-5", hasKey: false },
    { id: "deepseek", provider: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/anthropic", models: ["deepseek-v4-pro", "deepseek-flash"], defaultModel: "deepseek-v4-pro", hasKey: true },
    { id: "ollama", provider: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434", models: ["qwen3-coder"], defaultModel: "qwen3-coder", hasKey: false },
    { id: "kimi", provider: "kimi", label: "Kimi", baseUrl: null, models: ["k3.1-pro"], defaultModel: "k3.1-pro", hasKey: false },
    { id: "anthropic", provider: "anthropic", label: "Anthropic API", baseUrl: "https://api.anthropic.com", models: ["claude-haiku-5-5"], defaultModel: "claude-haiku-5-5", hasKey: true },
  ];
  const accounts = [{ agent: "claude@lichno", loggedIn: true }, { agent: "codex@rabota", loggedIn: true }, { agent: "claude@old", loggedIn: false }];
  it("accounts, provider keys and saved connections, each with its models; nothing that cannot run", () => {
    const r = taskAgents({ accounts, keys: ["anthropic"], connections: conns, demo: false, preferred: null }, "en");
    expect(r.map((a) => [a.id, a.defaultModel, a.models.length])).toEqual([
      ["claude@lichno", "claude-opus-5-5", 2], ["codex@rabota", "gpt-5-codex", 1], ["claude", "claude-haiku-5-5", 1], ["claude+deepseek", "deepseek-v4-pro", 2], ["claude+ollama", "qwen3-coder", 1],
    ]);
    expect(r.find((a) => a.id === "claude+ollama")?.label).toBe("Claude Code · Ollama");
    expect(r.find((a) => a.id === "claude+ollama")?.local).toBe(true);
  });
  it("D-610: a subscription account says whose it is (its email) and until when it is out of its limit", () => {
    const withMail = [{ agent: "claude@lichno", loggedIn: true, email: "simo@example.com" }, { agent: "claude@lichno-2", loggedIn: true, email: null }];
    const r = taskAgents({ accounts: withMail, keys: [], connections: [], demo: false, preferred: null, limits: { "claude@lichno": "2026-11-26T09:00:00.000Z" } }, "en");
    expect(r.find((a) => a.id === "claude@lichno")).toMatchObject({ label: "Claude · simo@example.com", limitedUntil: "2026-11-26T09:00:00.000Z" });
    expect(r.find((a) => a.id === "claude@lichno-2")).toMatchObject({ label: "Claude Code · lichno-2", limitedUntil: null });
  });
  it("the remembered default comes first; a gone default changes nothing", () => {
    expect(taskAgents({ accounts, keys: [], connections: conns, demo: false, preferred: "claude+deepseek" }, "en")[0]?.id).toBe("claude+deepseek");
    expect(taskAgents({ accounts, keys: [], connections: conns, demo: false, preferred: "claude+gone" }, "en")[0]?.id).toBe("claude@lichno");
  });
  it("D-427: a Google Gemini connection with its key → gemini+<id> (Gemini CLI); without a key it is not offered", () => {
    const g: Connection = { id: "gemini", provider: "gemini", label: "Google Gemini", baseUrl: null, models: ["gemini-3.8-flash", "gemini-4-argon"], defaultModel: "gemini-3.8-flash", hasKey: true };
    const r = taskAgents({ accounts: [], keys: [], connections: [g], demo: false, preferred: null }, "en");
    expect(r.map((a) => [a.id, a.label, a.defaultModel, a.local])).toEqual([["gemini+gemini", "Gemini CLI · Google Gemini", "gemini-3.8-flash", false]]);
    expect(taskAgents({ accounts: [], keys: [], connections: [{ ...g, hasKey: false }], demo: false, preferred: null }, "bg")).toEqual([]);
    expect(agentLabel("gemini+gemini", "bg", "Google Gemini")).toBe("Gemini CLI · Google Gemini");
    expect(CreateTaskBody.safeParse({ type: "free", agent: "gemini+gemini", model: "gemini-4-argon", text: "x" }).success).toBe(true);
    expect(CreateTaskBody.safeParse({ type: "free", agent: "gemini@lichno", text: "x" }).success).toBe(false);
  });
  it("CreateTaskBody: a connection agent and a model id; a bad model is refused", () => {
    expect(CreateTaskBody.safeParse({ type: "free", agent: "claude+deepseek", model: "deepseek-flash", text: "x" }).success).toBe(true);
    expect(CreateTaskBody.safeParse({ type: "free", agent: "codex@rabota", text: "x" }).success).toBe(true);
    expect(CreateTaskBody.safeParse({ type: "free", agent: "claude", model: "a b", text: "x" }).success).toBe(false);
  });
});

// D-471, D-473: every saved key becomes a choice in the task box with its models — a second Anthropic key, an OpenAI-
// compatible provider for Codex; a provider no agent here can use is listed apart (apiKeyUse), never offered to run.
describe("taskAgents: keys become models (D-471, D-473)", () => {
  const key = { hasKey: true } as const;
  const conns: Connection[] = [
    { id: "anthropic", provider: "anthropic", label: "Personal", baseUrl: "https://api.anthropic.com", models: ["claude-sonnet-5-5"], defaultModel: "claude-sonnet-5-5", ...key },
    { id: "anthropic-2", provider: "anthropic", label: "Work", baseUrl: "https://api.anthropic.com", models: ["claude-opus-5-5", "claude-sonnet-5-5"], defaultModel: "claude-opus-5-5", ...key },
    { id: "xai", provider: "xai", label: "xAI Grok", baseUrl: null, models: ["grok-x"], defaultModel: "grok-x", ...key },
    { id: "cerebras", provider: "cerebras", label: "Cerebras", baseUrl: null, models: ["m1"], defaultModel: "m1", ...key },
  ];
  it("a second Anthropic key is its own Claude Code choice; xAI runs on Codex; Cerebras (Chat Completions only) is not offered", () => {
    const r = taskAgents({ accounts: [], keys: ["anthropic"], connections: conns, demo: false, preferred: null }, "en");
    expect(r.map((a) => [a.id, a.label, a.defaultModel])).toEqual([
      ["claude", "Claude Code", "claude-sonnet-5-5"],
      ["claude+anthropic-2", "Claude Code · Work", "claude-opus-5-5"],
      ["codex+xai", "Codex · xAI Grok", "grok-x"],
    ]);
  });
  it("apiKeyUse says honestly which agent can use a provider's key", () => {
    expect(apiKeyUse("anthropic")).toBe("claude");
    expect(apiKeyUse("xai")).toBe("codex");
    expect(apiKeyUse("gemini")).toBe("gemini");
    expect(apiKeyUse("cerebras")).toBeNull();
  });
});
