import { SUBSCRIPTIONS } from "@mandat/contract";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MandatError } from "@mandat/contract";
import { ConnectionStore, verifyTaskToken } from "@mandat/llm-proxy";
import { GEMINI_TUNNELS, OPENAI_TUNNELS, channelFor } from "./index.js";

// D-392: the channel of a saved connection (conn-<id>) is an API-key channel whose tokens name that proxy upstream;
// a ChatGPT subscription (codex-profile-<name>) is a profile channel with OpenAI's tunnels; the Anthropic key takes any
// Claude model the proxy prices.
const secret = randomBytes(32);
const secretPath = path.join(mkdtempSync(path.join(tmpdir(), "mandat-conn-")), "secret");
writeFileSync(secretPath, secret);
const o = { proxyAdminUrl: "http://127.0.0.1:8788", secretPath };

describe("connection channels (D-392)", () => {
  it("conn-<id> → its token names the upstream (u) and the wire of the agent; local servers too", async () => {
    for (const kind of ["api_key", "local"] as const) {
      const ch = channelFor({ label: "conn-deepseek", kind, model: "deepseek-v4-pro" }, o);
      expect([ch.kind, ch.provider, ch.model]).toEqual([kind, "anthropic", "deepseek-v4-pro"]);
      const c = await ch.issueTaskCredential({ taskId: "t_x", runId: "r_x", attempt: 1, budgetUsd: 1, ttlMin: 5 });
      const v = verifyTaskToken(secret, c.token, Math.floor(Date.now() / 1000));
      expect(v.ok && [v.claims.u, v.claims.p ?? "anthropic"]).toEqual(["deepseek", "anthropic"]);
      expect(ch.sandboxEnv(c)).toEqual({ ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: c.token });
    }
    const cx = channelFor({ label: "conn-openrouter", kind: "api_key", model: "openai/gpt-5" }, { ...o, provider: "openai" });
    const t = await cx.issueTaskCredential({ taskId: "t_x", runId: "r_y", attempt: 1, budgetUsd: 1, ttlMin: 5 });
    const v = verifyTaskToken(secret, t.token, Math.floor(Date.now() / 1000));
    expect(v.ok && [v.claims.u, v.claims.p]).toEqual(["openrouter", "openai"]);
    expect(cx.gateRoutes().map((r) => r.match.kind === "exact" ? r.match.path : "")).toContain("/v1/responses");
  });
  it("the Anthropic key takes any priced Claude model; other names stay refused", () => {
    for (const m of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-1"]) expect(channelFor({ label: "anthropic-key-main", kind: "api_key", model: m }, o).model).toBe(m);
    expect(() => channelFor({ label: "anthropic-key-main", kind: "api_key", model: "gpt-5" }, o)).toThrow(MandatError);
    expect(() => channelFor({ label: "conn-Bad", kind: "api_key", model: "m" }, o)).toThrow(MandatError);
  });
  it("codex-profile-<name> → a ChatGPT subscription: no token, OpenAI's tunnels only", () => {
    const ch = channelFor({ label: "codex-profile-rabota", kind: "cli_profile", model: "gpt-5-codex" }, o);
    expect([ch.kind, ch.provider, ch.profileName]).toEqual(["cli_profile", "openai", "rabota"]);
    expect(ch.gateTunnels?.()).toEqual(OPENAI_TUNNELS.map((t) => ({ ...t })));
    expect(OPENAI_TUNNELS.every((t) => t.port === 443 && /(^|\.)(openai\.com|chatgpt\.com)$/.test(t.host))).toBe(true);
    // D-426: from the Codex source — the ChatGPT backend and the token refresh; api.openai.com is the API-key path only
    expect(OPENAI_TUNNELS.map((t) => t.host)).toEqual(["chatgpt.com", "auth.openai.com"]);
  });
  it("D-464: <cli>-profile-<name> for any subscription CLI — its own tunnels from the registry, no token", () => {
    for (const cli of ["copilot", "kimi", "cursor", "minimax", "antigravity", "gemini"] as const) {
      const ch = channelFor({ label: `${cli}-profile-rabota`, kind: "cli_profile", model: "m" }, o);
      expect([ch.kind, ch.cli, ch.profileName]).toEqual(["cli_profile", cli, "rabota"]);
      expect(ch.gateTunnels?.()).toEqual(SUBSCRIPTIONS[cli].tunnels.map((t) => ({ ...t })));
    }
    expect(channelFor({ label: "claude-profile-a", kind: "cli_profile", model: "m" }, o).cli).toBe("claude");
    expect(() => channelFor({ label: "nope-profile-a", kind: "cli_profile", model: "m" }, o)).toThrow(MandatError);
  });
});

// D-422 (spec 5.3): a local channel named in the proxy's env (MANDAT_UPSTREAM_LOCAL_<label>) is model_channels row
// local-<label> with kind local; its tokens name the upstream local-<label>
describe("env local channels (D-422)", () => {
  it("local-<label> + kind local → the token names upstream local-<label>; kind api_key or a bad label is refused", async () => {
    const ch = channelFor({ label: "local-ollama", kind: "local", model: "qwen3-coder:30b" }, o);
    expect([ch.kind, ch.provider]).toEqual(["local", "anthropic"]);
    const c = await ch.issueTaskCredential({ taskId: "t_x", runId: "r_l", attempt: 1, budgetUsd: 1, ttlMin: 5 });
    const v = verifyTaskToken(secret, c.token, Math.floor(Date.now() / 1000));
    expect(v.ok && v.claims.u).toBe("local-ollama");
    expect(channelFor({ label: "local-vllm-box", kind: "local", model: "m" }, { ...o, provider: "openai" }).provider).toBe("openai");
    expect(() => channelFor({ label: "local-ollama", kind: "api_key", model: "m" }, o)).toThrow(MandatError);
    expect(() => channelFor({ label: "local-", kind: "local", model: "m" }, o)).toThrow(MandatError);
  });
});

// D-424: Gemini CLI through a saved Gemini connection (conn-<id>, provider gemini); D-425: a Google login profile
describe("gemini channels (D-424, D-425)", () => {
  it("conn-<id> with provider gemini: a gemini token for that upstream, GEMINI_API_KEY + the gate as base URL, /v1beta/models/ only", async () => {
    const ch = channelFor({ label: "conn-gemini", kind: "api_key", model: "gemini-2.5-pro" }, { ...o, provider: "gemini" });
    const c = await ch.issueTaskCredential({ taskId: "t_x", runId: "r_g", attempt: 1, budgetUsd: 1, ttlMin: 5 });
    const v = verifyTaskToken(secret, c.token, Math.floor(Date.now() / 1000));
    expect(v.ok && [v.claims.u, v.claims.p]).toEqual(["gemini", "gemini"]);
    expect(ch.sandboxEnv(c)).toEqual({ GEMINI_API_KEY: c.token, GOOGLE_GEMINI_BASE_URL: "http://egress-gate" });
    expect(ch.gateRoutes().map((r) => [r.method, r.match.kind, r.match.path])).toEqual([["POST", "prefix", "/v1beta/models/"], ["HEAD", "exact", "/api/hello"]]);
  });
  it("gemini-profile-<name>: a Google login — no token, Google's tunnels only", () => {
    const ch = channelFor({ label: "gemini-profile-lichno", kind: "cli_profile", model: "gemini-2.5-pro" }, o);
    expect([ch.kind, ch.provider, ch.profileName]).toEqual(["cli_profile", "gemini", "lichno"]);
    expect(ch.gateTunnels?.()).toEqual(GEMINI_TUNNELS);
    expect(GEMINI_TUNNELS.map((t) => t.host)).toEqual(["cloudcode-pa.googleapis.com", "oauth2.googleapis.com", "www.googleapis.com"]);
  });
});

// D-474: a saved key never reaches the sandbox — the second Anthropic key of a person is sealed in the store, the channel of
// its connection hands the agent an mdt_ token for that upstream, and nothing of the key is in the sandbox env or routes.
describe("a saved key never reaches the sandbox (D-474)", () => {
  it("conn-anthropic-2: the env and the gate routes hold the token only", async () => {
    const key = ["sk", "ant", randomBytes(24).toString("base64url")].join("-");
    const store = new ConnectionStore(mkdtempSync(path.join(tmpdir(), "mandat-keys-")), randomBytes(32));
    store.put({ id: "anthropic-2", provider: "anthropic", label: "Work", baseUrl: "https://api.anthropic.com", models: ["claude-opus-5-5"], defaultModel: "claude-opus-5-5" }, key);
    expect(store.upstreams()["anthropic-2"]?.key).toBe(key); // only the proxy boot payload has it
    const ch = channelFor({ label: "conn-anthropic-2", kind: "api_key", model: "claude-opus-5-5" }, o);
    const c = await ch.issueTaskCredential({ taskId: "t_x", runId: "r_k", attempt: 1, budgetUsd: 1, ttlMin: 5 });
    const env = ch.sandboxEnv(c);
    expect(c.token.startsWith("mdt_")).toBe(true);
    expect(JSON.stringify([env, ch.gateRoutes(), c])).not.toContain(key);
    expect(Object.values(env).some((v) => v.includes(key.slice(-12)))).toBe(false);
  });
});
