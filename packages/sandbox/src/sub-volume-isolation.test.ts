import { describe, expect, it } from "vitest";
import { MandatError } from "@mandat/contract";
import { PROFILE_DIR, buildRunArgs, profileVolume } from "./index.js";
import type { RunRole } from "./index.js";

// v5 S-SUB (static half): no harness container but the agent ever mounts a subscription profile volume; the agent only
// at PROFILE_DIR. The live half (a real login, the gate log) is in docs/setup/local-live-checklist.md (S-SUB).
const ctx = { home: "/home/u", mandatHome: "/home/u/.mandat", runDir: "/home/u/.mandat/runs/r_x" };
const vol = profileVolume("claude", "lichno");
const spec = (role: RunRole, target = PROFILE_DIR, readonly = false) => ({
  role, runId: "r_x", image: "img", network: "none", user: "1000:1000" as const, envNames: [], publicEnv: {},
  mounts: [{ kind: "volume" as const, source: vol, target, readonly }],
});

describe("subscription volume isolation (S-SUB, D-295)", () => {
  it.each(["seed", "install", "export", "test", "gate"] as const)("role %s cannot mount the profile volume (rw or ro)", (role) => {
    expect(() => buildRunArgs(spec(role), ctx)).toThrow(MandatError);
    expect(() => buildRunArgs(spec(role, PROFILE_DIR, true), ctx)).toThrow(MandatError);
  });
  it("the agent mounts it only at PROFILE_DIR; a second target or a work path is refused", () => {
    expect(buildRunArgs(spec("agent"), ctx).join(" ")).toContain(`${vol}:${PROFILE_DIR}`);
    for (const t of ["/m", "/m/work/.claude", "/home/agent", "/tmp/p"]) expect(() => buildRunArgs(spec("agent", t), ctx)).toThrow(MandatError);
  });
  it("another volume cannot be mounted at PROFILE_DIR", () => {
    const s = { ...spec("agent"), mounts: [{ kind: "volume" as const, source: "mandat-run-x-agent", target: PROFILE_DIR, readonly: false }] };
    expect(() => buildRunArgs(s, ctx)).toThrow(MandatError);
  });
});
