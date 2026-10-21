import { describe, expect, it } from "vitest";
import { PROFILE_DIR, profileVolume } from "@mandat/sandbox";
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
