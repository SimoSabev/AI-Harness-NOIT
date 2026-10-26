import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MandatError } from "@mandat/contract";
import { verifyTaskToken } from "@mandat/llm-proxy";
import { OPENAI_TUNNELS, channelFor } from "./index.js";

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
  });
});
