import { describe, expect, it } from "vitest";
import { CODEX_PROFILE_DIR, PROFILE_DIR, profileVolume } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { runSandbox } from "./sandbox-exec.js";

// D-295: the agent of a subscription task gets its profile volume and the profile env; nothing else does.
describe("runSandbox with a subscription profile (D-295)", () => {
  it("agent: -v <profile>:PROFILE_DIR, CLAUDE_CONFIG_DIR + HTTPS_PROXY, no ANTHROPIC_API_KEY name", async () => {
    const calls: string[][] = [];
    const docker: DockerRunner = { run: (args) => (calls.push(args), Promise.resolve({ exitCode: 0, timedOut: false })) };
    const ctx = { docker, runId: "r_x", runDir: "/h/p/.mandat/runs/r_x", mandatHome: "/h/p/.mandat", home: "/h", image: "img", ipv6Sysctl: false };
    const vol = profileVolume("claude", "work");
    await runSandbox(ctx, { role: "agent", volume: "v", network: "none", env: { phase: "agent", secrets: { AWS_SECRET_ACCESS_KEY: "c" } }, profile: vol, cmd: ["claude"], timeoutMs: 1000 });
    const a = calls[0] ?? [];
    expect(a).toEqual(expect.arrayContaining(["-v", `${vol}:${PROFILE_DIR}`, "-e", `CLAUDE_CONFIG_DIR=${PROFILE_DIR}`, "-e", "HTTPS_PROXY=http://egress-gate:80"]));
    expect(a).not.toContain("ANTHROPIC_API_KEY");
    expect(() => runSandbox(ctx, { role: "test", volume: "v", network: "none", env: { phase: "test" }, profile: vol, cmd: ["x"], timeoutMs: 1000 })).toThrow(/profile/);
  });
});

// D-392: a ChatGPT subscription mounts Codex's own profile at CODEX_PROFILE_DIR; a saved connection's model reaches the env.
describe("runSandbox with connections (D-392)", () => {
  const calls: string[][] = [];
  const docker: DockerRunner = { run: (args) => (calls.push(args), Promise.resolve({ exitCode: 0, timedOut: false })) };
  const ctx = { docker, runId: "r_x", runDir: "/h/p/.mandat/runs/r_x", mandatHome: "/h/p/.mandat", home: "/h", image: "img", ipv6Sysctl: false };
  it("codex profile: -v <profile>:CODEX_PROFILE_DIR, CODEX_HOME + HTTPS_PROXY, no OPENAI_API_KEY name", async () => {
    const vol = profileVolume("codex", "rabota");
    await runSandbox(ctx, { role: "agent", volume: "v", network: "none", env: { phase: "agent", secrets: { AWS_SECRET_ACCESS_KEY: "c" } }, profile: vol, cmd: ["codex"], timeoutMs: 1000 });
    const a = calls.at(-1) ?? [];
    expect(a).toEqual(expect.arrayContaining(["-v", `${vol}:${CODEX_PROFILE_DIR}`, "-e", `CODEX_HOME=${CODEX_PROFILE_DIR}`, "-e", "HTTPS_PROXY=http://egress-gate:80"]));
    expect(a).not.toContain("OPENAI_API_KEY");
  });
  it("a connection's model: every Claude tier is that model", async () => {
    await runSandbox(ctx, { role: "agent", volume: "v", network: "none", env: { phase: "agent", secrets: { ANTHROPIC_API_KEY: "mdt_x" }, model: "qwen3-coder" }, cmd: ["claude"], timeoutMs: 1000 });
    expect(calls.at(-1)).toEqual(expect.arrayContaining(["-e", "ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder", "-e", "CLAUDE_CODE_SUBAGENT_MODEL=qwen3-coder"]));
  });
});
