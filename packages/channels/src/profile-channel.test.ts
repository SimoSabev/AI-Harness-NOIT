import { describe, expect, it } from "vitest";
import { MandatError } from "@mandat/contract";
import { ANTHROPIC_TUNNELS, channelFor } from "./index.js";

// D-295: a subscription profile channel — no proxy, no token; the gate opens only the Anthropic tunnels.
describe("profile channel (D-295)", () => {
  const o = { proxyAdminUrl: "http://127.0.0.1:1", secretPath: "/nope" };
  it("claude-profile-<name> → kind cli_profile, the profile name, Anthropic tunnels, no LLM routes", async () => {
    const ch = channelFor({ label: "claude-profile-work", kind: "cli_profile", model: "claude-sonnet-5-5" }, o);
    expect([ch.kind, ch.provider, ch.profileName]).toEqual(["cli_profile", "anthropic", "work"]);
    expect(ch.gateTunnels?.()).toEqual(ANTHROPIC_TUNNELS.map((t) => ({ ...t })));
    expect(ch.gateRoutes().some((r) => r.upstream === "llm_proxy")).toBe(false);
    expect((await ch.usage("r_x")).requests).toBe(0);
    await expect(ch.revokeTaskCredential("r_x")).resolves.toBeUndefined();
    expect(ANTHROPIC_TUNNELS.map((t) => `${t.host}:${t.port}`)).toEqual(["api.anthropic.com:443", "console.anthropic.com:443", "platform.claude.com:443"]);
  });
  it("a bad profile label → E_CHANNEL_UNSUPPORTED", () => {
    for (const label of ["claude-profile-", "claude-profile-Work", "codex-profile-x"]) expect(() => channelFor({ label, kind: "cli_profile", model: "m" }, o)).toThrow(MandatError);
  });
});
