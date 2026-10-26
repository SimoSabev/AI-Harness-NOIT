import path from "node:path";
import { describe, expect, it } from "vitest";
import { CODEX_PROFILE_DIR, PROFILE_DIR, buildProfileArgs, buildProxyRunArgs, buildRunArgs, envForPhase, profileVolume } from "./index.js";

// D-392: a saved connection runs the same sandbox; what changes is the proxy's reach (a server on this computer), the
// model names Claude Code uses for every tier, and — for a ChatGPT subscription — Codex's own login volume.
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
};
const MH = path.resolve("/srv/mandat-home");

describe("connections in the sandbox (D-392)", () => {
  it("the proxy reaches this computer as host.docker.internal (Ollama, LM Studio); the sandbox never does", () => {
    const a = buildProxyRunArgs({ name: "mandat-llm-proxy", image: "img", user: "1000:1000", mandatHome: MH, publishAdminPort: 8788, envNames: [], publicEnv: {} });
    expect(a.join(" ")).toContain("--add-host host.docker.internal:host-gateway");
  });
  it("a connection's model is every tier and the subagents' model, so Claude Code never asks it for a Claude name", () => {
    const e = envForPhase("agent", { model: "deepseek-v4-pro" });
    for (const k of ["ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_FABLE_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL"]) expect(e.publicValues[k]).toBe("deepseek-v4-pro");
    expect(e.publicValues.ANTHROPIC_BASE_URL).toBe("http://egress-gate");
    expect(envForPhase("agent").publicValues.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-haiku-5-5");
    expect(code(() => envForPhase("agent", { model: "x; rm -rf /" }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
  });
  it("a ChatGPT subscription: Codex with CODEX_HOME on its own profile volume, out only through the gate's tunnel", () => {
    const e = envForPhase("agent", { tokenName: "profile-codex" });
    expect(e.names).toEqual(["AWS_SECRET_ACCESS_KEY"]);
    expect(e.publicValues).toMatchObject({ CODEX_HOME: CODEX_PROFILE_DIR, HTTPS_PROXY: "http://egress-gate:80" });
    expect(Object.keys(e.publicValues).some((k) => k.startsWith("ANTHROPIC_") || k === "OPENAI_API_KEY")).toBe(false);
    expect(profileVolume("codex", "rabota")).toBe("mandat-profile-codex-rabota");
  });
  it("only the agent mounts a profile volume, each at its own place (claude → PROFILE_DIR, codex → CODEX_PROFILE_DIR)", () => {
    const spec = (source: string, target: string, role: "agent" | "seed" = "agent") => ({ role, runId: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", image: "img", network: "none", user: "1000:1000" as const, envNames: [], publicEnv: {}, mounts: [{ kind: "volume" as const, source, target, readonly: false }] });
    const ctx = { home: "/home/x", mandatHome: MH, runDir: path.join(MH, "runs", "r_x") };
    expect(code(() => buildRunArgs(spec(profileVolume("codex", "a"), CODEX_PROFILE_DIR), ctx))).toBeUndefined();
    expect(code(() => buildRunArgs(spec(profileVolume("codex", "a"), PROFILE_DIR), ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildRunArgs(spec(profileVolume("claude", "a"), CODEX_PROFILE_DIR), ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildRunArgs(spec(profileVolume("codex", "a"), CODEX_PROFILE_DIR, "seed"), ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
  });
  it("the helper containers of a ChatGPT sign-in run the unmodified `codex login --device-auth`, status and logout", () => {
    const vol = profileVolume("codex", "rabota");
    const login = buildProfileArgs("login-web", { image: "img", volume: vol });
    expect(login).toEqual(expect.arrayContaining(["--entrypoint", "codex", "-e", `CODEX_HOME=${CODEX_PROFILE_DIR}`, "--network", "mandat-upstream", "-v", `${vol}:${CODEX_PROFILE_DIR}`]));
    expect(login.slice(login.indexOf("img"))).toEqual(["img", "login", "--device-auth"]);
    const status = buildProfileArgs("status", { image: "img", volume: vol });
    expect(status).toEqual(expect.arrayContaining(["--network", "none", "-v", `${vol}:${CODEX_PROFILE_DIR}:ro`]));
    expect(status.slice(status.indexOf("img"))).toEqual(["img", "login", "status"]);
    const out = buildProfileArgs("logout", { image: "img", volume: vol });
    expect(out.slice(out.indexOf("img"))).toEqual(["img", "logout"]);
    expect(buildProfileArgs("init", { image: "img", volume: vol }).join(" ")).toContain(`chown 1000:1000 ${CODEX_PROFILE_DIR}`);
  });
});
