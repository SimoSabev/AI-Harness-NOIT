import { describe, expect, it } from "vitest";
import { GateTunnelSchema } from "./gate.js";
import { PROVIDERS } from "./connections.js";
import {
  LOGIN_CLIS, SUBSCRIPTIONS, SubscriptionId, SubscriptionProvider, canSignIn, isSubscriptionLoginHost, parseProfileVolume, profileVolumeName,
  subscriptionOf, subscriptionStatus,
} from "./subscriptions.js";

// D-460: one record per subscription provider — the CLI, how the person signs in, where the login lives, the tunnels the
// sandbox may open, the terms. Adding a provider is one entry here, not new code in the sandbox, the CLI and the web.
describe("subscriptions: the registry (D-460)", () => {
  it("every entry is valid, dated and linked (AGENTS.md rule 9)", () => {
    for (const [id, p] of Object.entries(SUBSCRIPTIONS)) {
      expect(SubscriptionProvider.safeParse(p).success, id).toBe(true);
      expect(p.id).toBe(id);
      expect(p.docs).toMatch(/^https:\/\//);
      expect(p.terms.url).toMatch(/^https:\/\//);
      expect(p.checked).toMatch(/^2026-\d\d-\d\d$/);
      for (const t of p.tunnels) expect(GateTunnelSchema.safeParse(t).success, `${id} ${t.host}`).toBe(true);
    }
  });
  it("ids have no dash, so a profile volume name maps back to exactly one provider", () => {
    for (const id of SubscriptionId.options) expect(id).toMatch(/^[a-z]+$/);
    for (const id of SubscriptionId.options) {
      expect(parseProfileVolume(profileVolumeName(id, "work-2"))).toEqual({ id, name: "work-2" });
    }
    expect(parseProfileVolume("mandat-profile-nope-x")).toBeNull();
    expect(parseProfileVolume("other-volume")).toBeNull();
    expect(() => profileVolumeName("claude", "Bad Name")).toThrow();
  });
  it("keeps the volumes of the existing accounts (D-295, D-392): mandat-profile-claude-<name>, mandat-profile-codex-<name>", () => {
    expect(profileVolumeName("claude", "lichno")).toBe("mandat-profile-claude-lichno");
    expect(profileVolumeName("codex", "lichno-chatgpt")).toBe("mandat-profile-codex-lichno-chatgpt");
  });
  it("Claude, Codex and Gemini are here, as the sandbox and the channels already run them", () => {
    expect(subscriptionOf("claude")).toMatchObject({
      configDir: "/home/agent/.claude-profile", configEnv: "CLAUDE_CONFIG_DIR", agent: "claude", connectionProvider: "claude-sub",
      login: { method: "paste_code", argv: ["auth", "login", "--claudeai"] }, status: { argv: ["auth", "status", "--json"], format: "claude-json" }, logout: ["auth", "logout"],
    });
    expect(subscriptionOf("codex")).toMatchObject({
      configDir: "/home/agent/.codex-profile", configEnv: "CODEX_HOME", agent: "codex", connectionProvider: "chatgpt-sub",
      login: { method: "device_code", argv: ["login", "--device-auth"] }, status: { argv: ["login", "status"], format: "codex-text" }, logout: ["logout"],
    });
    expect(subscriptionOf("codex").tunnels.map((t) => t.host)).toEqual(["chatgpt.com", "auth.openai.com"]);
    expect(subscriptionOf("claude").tunnels.map((t) => t.host)).toEqual(["api.anthropic.com", "console.anthropic.com", "platform.claude.com"]);
    expect(subscriptionOf("gemini")).toMatchObject({ configEnv: "GEMINI_CLI_HOME", agent: "gemini", availability: "blocked", terms: { harness: "unclear" } });
  });
  it("a sign-in runs only for a provider whose CLI and adapter are in the sandbox and whose terms are not against it", () => {
    expect(canSignIn("claude")).toBe(true);
    expect(canSignIn("codex")).toBe(true);
    expect(canSignIn("gemini")).toBe(false); // Q-073
    for (const id of SubscriptionId.options) {
      const p = subscriptionOf(id);
      expect(canSignIn(id)).toBe((p.availability === "ready" || p.availability === "untested") && p.agent !== null && p.terms.harness !== "forbidden");
      if (canSignIn(id) && p.connectionProvider !== null) expect(PROVIDERS[p.connectionProvider].kind).toBe("subscription");
      // D-464: whatever can sign in has a sign-in and a status command the helper containers run
      if (canSignIn(id)) expect([p.login.argv.length > 0, p.status.argv.length > 0], id).toEqual([true, true]);
    }
    expect([...LOGIN_CLIS]).toEqual(SubscriptionId.options.filter(canSignIn));
  });
  it("D-464 Kimi Code: device code into KIMI_CODE_HOME, status from its provider list, no telemetry or self-update", () => {
    expect(subscriptionOf("kimi")).toMatchObject({
      cli: { bin: "kimi", npm: "@moonshot-ai/kimi-code", version: "2.4.1", license: "MIT" }, agent: "kimi", availability: "untested",
      login: { method: "device_code", argv: ["login", "--region", "global"] }, status: { argv: ["provider", "list", "--json"], format: "match", match: "managed:kimi-code" },
      logout: [], configDir: "/home/agent/.kimi-profile", configEnv: "KIMI_CODE_HOME", env: { KIMI_DISABLE_TELEMETRY: "1", KIMI_CODE_NO_AUTO_UPDATE: "1" },
    });
    expect(subscriptionOf("kimi").tunnels.map((t) => t.host)).toEqual(["auth.kimi.ai", "api.kimi.ai"]);
    expect(canSignIn("kimi")).toBe(true);
  });
  it("planned providers carry no login commands the sandbox could run by accident", () => {
    for (const p of Object.values(SUBSCRIPTIONS).filter((x) => x.availability === "planned")) {
      expect(p.agent, p.id).toBeNull();
      expect(canSignIn(p.id)).toBe(false);
    }
  });
  it("only the provider's own sign-in pages are shown to the person", () => {
    expect(isSubscriptionLoginHost("codex", "https://auth.openai.com/codex/device")).toBe(true);
    expect(isSubscriptionLoginHost("codex", "https://evil.example/codex/device")).toBe(false);
    expect(isSubscriptionLoginHost("codex", "http://auth.openai.com/codex/device")).toBe(false);
    expect(isSubscriptionLoginHost("codex", "https://user:pw@auth.openai.com/x")).toBe(false);
    expect(isSubscriptionLoginHost("claude", "https://claude.ai/oauth/authorize")).toBe(true);
  });
});

describe("subscriptions: status (D-461)", () => {
  it("signed in, expired (the volume is there, the login no longer works), no CLI, not available", () => {
    expect(subscriptionStatus("claude", { loggedIn: true })).toBe("signed_in");
    // a volume survives only a finished sign-in (login-session.ts removes the new volume of an unfinished one)
    expect(subscriptionStatus("claude", { loggedIn: false })).toBe("expired");
    expect(subscriptionStatus("claude", { loggedIn: false, imageMissing: true })).toBe("no_cli");
    const planned = SubscriptionId.options.find((id) => subscriptionOf(id).availability === "planned");
    if (planned) expect(subscriptionStatus(planned, { loggedIn: false })).toBe("no_cli");
    expect(subscriptionStatus("gemini", { loggedIn: true })).toBe("unavailable");
  });
});
