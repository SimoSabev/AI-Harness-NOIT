import { describe, expect, it } from "vitest";
import { CATALOG } from "@mandat/contract";
import type { Connection } from "@mandat/contract";
import { addKeyBody, keyProviderGroups, keyRows, statusOf } from "./api-keys-view";

// D-475: the API keys section — what a person sees of each saved key (label, provider, the last four characters, the last
// check, which agent can use it) and the body of "Add a key". Nothing here ever holds a full key except the add form.
const key = { hasKey: true } as const;
const conns: Connection[] = [
  { id: "lichno", provider: "claude-sub", label: "lichno", baseUrl: null, models: ["claude-sonnet-5-5"], defaultModel: "claude-sonnet-5-5", hasKey: false },
  { id: "anthropic-2", provider: "anthropic", label: "Work", baseUrl: "https://api.anthropic.com", models: ["claude-opus-5-5"], defaultModel: "claude-opus-5-5", keyHint: "WXYZ", check: { status: "no_credit", at: "2026-11-04T10:00:00.000Z" }, ...key },
  { id: "ollama", provider: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434", models: ["qwen3-coder"], defaultModel: "qwen3-coder", hasKey: false },
  { id: "cerebras", provider: "cerebras", label: "Cerebras", baseUrl: "https://api.cerebras.ai", models: ["gpt-oss-120b"], defaultModel: "gpt-oss-120b", keyHint: "abcd", ...key },
];

describe("keyRows (D-475)", () => {
  it("only key-taking connections, each with its hint, status, agent and models", () => {
    expect(keyRows(conns)).toEqual([
      { id: "anthropic-2", label: "Work", provider: "Anthropic API", hint: "WXYZ", status: "no_credit", agent: "claude", models: ["claude-opus-5-5"], defaultModel: "claude-opus-5-5", live: true, docs: expect.stringMatching(/^https:/) },
      { id: "cerebras", label: "Cerebras", provider: "Cerebras", hint: "abcd", status: null, agent: null, models: ["gpt-oss-120b"], defaultModel: "gpt-oss-120b", live: false, docs: expect.stringMatching(/^https:/) },
    ]);
  });
  it("statusOf: the badge for each check result (and for none yet)", () => {
    expect(statusOf("ok")).toEqual({ tone: "green", label: "apikeys.status.ok" });
    expect(statusOf("bad_key")).toEqual({ tone: "red", label: "apikeys.status.bad_key" });
    expect(statusOf("no_credit")).toEqual({ tone: "amber", label: "apikeys.status.no_credit" });
    expect(statusOf("unreachable")).toEqual({ tone: "gray", label: "apikeys.status.unreachable" });
    expect(statusOf(null)).toEqual({ tone: "gray", label: "apikeys.status.unchecked" });
  });
});

describe("the add form (D-475)", () => {
  it("groups: every key-taking provider once, no subscriptions or local servers, no cloud credentials", () => {
    const ids = keyProviderGroups().flatMap((g) => g.ids);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CATALOG) {
      const want = p.kind === "api_key" && p.auth !== "aws" && p.auth !== "gcp";
      expect([p.id, ids.includes(p.id)]).toEqual([p.id, want]);
    }
  });
  it("addKeyBody: the recommended models by default; the address only when the provider has none or it was changed", () => {
    const k = "k".repeat(30);
    expect(addKeyBody({ provider: "deepseek", label: "", key: ` ${k} `, baseUrl: "https://api.deepseek.com/anthropic" })).toEqual({ provider: "deepseek", key: k, models: ["deepseek-v4-pro"], defaultModel: "deepseek-v4-pro" });
    expect(addKeyBody({ provider: "anthropic", label: "Work", key: k, baseUrl: "" })).toMatchObject({ label: "Work", models: ["claude-sonnet-5-5"] });
    expect(addKeyBody({ provider: "azure", label: "", key: k, baseUrl: "https://acme.openai.azure.com/openai", models: ["gpt-5"] })).toEqual({ provider: "azure", key: k, baseUrl: "https://acme.openai.azure.com/openai", models: ["gpt-5"], defaultModel: "gpt-5" });
    expect(addKeyBody({ provider: "azure", label: "", key: k, baseUrl: "https://acme.openai.azure.com/openai" })).toBeNull(); // no model to suggest
  });
});
