import { describe, expect, it } from "vitest";
import { AGENTS, AGENT_IDS, agentChoices, agentHint, agentLabel, taskAgents } from "./agents";
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
  it("the remembered default comes first; a gone default changes nothing", () => {
    expect(taskAgents({ accounts, keys: [], connections: conns, demo: false, preferred: "claude+deepseek" }, "en")[0]?.id).toBe("claude+deepseek");
    expect(taskAgents({ accounts, keys: [], connections: conns, demo: false, preferred: "claude+gone" }, "en")[0]?.id).toBe("claude@lichno");
  });
  it("CreateTaskBody: a connection agent and a model id; a bad model is refused", () => {
    expect(CreateTaskBody.safeParse({ type: "free", agent: "claude+deepseek", model: "deepseek-flash", text: "x" }).success).toBe(true);
    expect(CreateTaskBody.safeParse({ type: "free", agent: "codex@rabota", text: "x" }).success).toBe(true);
    expect(CreateTaskBody.safeParse({ type: "free", agent: "claude", model: "a b", text: "x" }).success).toBe(false);
  });
});
