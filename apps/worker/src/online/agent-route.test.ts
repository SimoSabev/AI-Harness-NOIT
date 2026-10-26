import { describe, expect, it } from "vitest";
import type { Connection } from "@mandat/contract";
import { routeOf } from "./agent-route.js";

// D-392: the agent of a task (claude, codex, claude@<account>, codex@<account>, claude+<connection>, codex+<connection>,
// fakes) and its picked model → what runs, on which channel. A fixed ref skips the org's channel selection.
const conns: Connection[] = [
  { id: "deepseek", provider: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/anthropic", models: ["deepseek-v4-pro", "deepseek-flash"], defaultModel: "deepseek-v4-pro", hasKey: true },
  { id: "ollama", provider: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434", models: ["qwen3-coder"], defaultModel: "qwen3-coder", hasKey: false },
  { id: "lichno", provider: "claude-sub", label: "Claude", baseUrl: null, models: ["claude-sonnet-5-5", "claude-opus-5-5"], defaultModel: "claude-opus-5-5", hasKey: false },
  { id: "nokey", provider: "kimi", label: "Kimi", baseUrl: null, models: ["k3.1-pro"], defaultModel: "k3.1-pro", hasKey: false },
];

describe("routeOf (D-392)", () => {
  it("a saved connection: Claude Code on conn-<id>, its default model or the picked one from its list", () => {
    expect(routeOf("claude+deepseek", null, conns)).toEqual({ ok: true, run: "claude", ref: { label: "conn-deepseek", kind: "api_key", model: "deepseek-v4-pro" }, account: null, local: false });
    expect(routeOf("claude+deepseek", "deepseek-flash", conns)).toMatchObject({ ref: { model: "deepseek-flash" } });
    expect(routeOf("claude+deepseek", "claude-opus-5-5", conns)).toMatchObject({ ref: { model: "deepseek-v4-pro" } }); // not in its list → default
    expect(routeOf("claude+ollama", null, conns)).toMatchObject({ ref: { label: "conn-ollama", kind: "local", model: "qwen3-coder" }, local: true });
  });
  it("a connection that is gone, or needs a key it does not have → no_connection (the task waits, nothing runs)", () => {
    expect(routeOf("claude+gone", null, conns)).toEqual({ ok: false, reason: "no_connection" });
    expect(routeOf("claude+nokey", null, conns)).toEqual({ ok: false, reason: "no_connection" });
  });
  it("subscriptions: the account's saved default model, or Sonnet / gpt-5-codex for an account without models", () => {
    expect(routeOf("claude@lichno", null, conns)).toEqual({ ok: true, run: "claude", ref: { label: "claude-profile-lichno", kind: "cli_profile", model: "claude-opus-5-5" }, account: "lichno", local: false });
    expect(routeOf("claude@other", null, conns)).toMatchObject({ ref: { model: "claude-sonnet-5-5" } });
    expect(routeOf("claude@lichno", "claude-sonnet-5-5", conns)).toMatchObject({ ref: { model: "claude-sonnet-5-5" } });
    expect(routeOf("codex@rabota", null, conns)).toEqual({ ok: true, run: "codex", ref: { label: "codex-profile-rabota", kind: "cli_profile", model: "gpt-5-codex" }, account: "rabota", local: false });
  });
  it("the provider keys: the org's channel selection decides; a picked Claude model is kept, others are dropped", () => {
    expect(routeOf("claude", null, conns)).toEqual({ ok: true, run: "claude", ref: null, model: null, account: null, local: false });
    expect(routeOf("claude", "claude-opus-5-5", conns)).toMatchObject({ ref: null, model: "claude-opus-5-5" });
    expect(routeOf("claude", "qwen3-coder", conns)).toMatchObject({ model: null });
    expect(routeOf("codex", "gpt-5-codex", conns)).toMatchObject({ run: "codex", model: "gpt-5-codex" });
    expect(routeOf("fake:honest-fix", null, conns)).toMatchObject({ run: "fake:honest-fix", ref: null });
    expect(routeOf("gemini", null, conns)).toEqual({ ok: false, reason: "unknown_agent" });
  });
});
