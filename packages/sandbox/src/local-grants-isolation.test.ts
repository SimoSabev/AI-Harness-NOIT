import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { LOCAL_GRANTS_FILE, MandatError } from "@mandat/contract";
import { buildRunArgs } from "./index.js";

// E9g A3 (D-373, rule 2/7): folder grants of the desktop app are for the person and the harness on the host. The agent
// in the sandbox gets nothing from them: granting a folder changes no docker argument (mounts, env), a granted folder
// still cannot be bind-mounted, and nothing on the sandbox/agent side reads the grants file.
const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-grants-iso-")));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const home = path.join(tmp, "home");
const mandatHome = path.join(home, ".mandat");
const project = path.join(home, "code", "shop");
mkdirSync(path.join(mandatHome, "runs", "r_x", "etc"), { recursive: true });
mkdirSync(project, { recursive: true });
const ctx = { home, mandatHome, runDir: path.join(mandatHome, "runs", "r_x") };
const agent = {
  role: "agent" as const, runId: "r_x", image: "img", network: "mandat-r_x", user: "1000:1000" as const, envNames: [], publicEnv: { MANDAT_TASK: "t_1" },
  mounts: [
    { kind: "volume" as const, source: "mandat-work-r_x", target: "/work", readonly: false },
    { kind: "bind" as const, source: path.join(mandatHome, "runs", "r_x", "etc", "hosts"), target: "/etc/hosts", readonly: true },
  ],
};

describe("folder grants never reach the sandbox (D-373)", () => {
  it("granting a folder changes no docker argument of the agent", () => {
    const before = buildRunArgs(agent, ctx);
    writeFileSync(path.join(mandatHome, LOCAL_GRANTS_FILE), JSON.stringify({ version: 1, grants: [{ path: project, scopes: ["read", "apply", "open_editor", "terminal"], granted_at: "2026-10-24T02:00:00.000Z" }] }), { mode: 0o600 });
    const after = buildRunArgs(agent, ctx);
    expect(after).toEqual(before);
    expect(after.join(" ")).not.toContain(project);
    expect(after.join(" ")).not.toContain(LOCAL_GRANTS_FILE);
  });

  it("a granted folder still cannot be bind-mounted into the sandbox (rw or ro), nor the grants file", () => {
    for (const readonly of [false, true]) {
      expect(() => buildRunArgs({ ...agent, mounts: [{ kind: "bind", source: project, target: "/work/shop", readonly }] }, ctx)).toThrow(MandatError);
      expect(() => buildRunArgs({ ...agent, mounts: [{ kind: "bind", source: path.join(mandatHome, LOCAL_GRANTS_FILE), target: "/m/g", readonly }] }, ctx)).toThrow(MandatError);
    }
  });

  it("no code on the sandbox / agent / worker side reads the grants file", () => {
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const roots = ["packages/sandbox/src", "packages/agents/src", "packages/egress-gate/src", "packages/llm-proxy/src", "packages/export/src", "packages/core/src", "packages/verify/src", "packages/profile/src", "apps/worker/src"];
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n)) : [path.join(d, n)]));
    const hits = roots
      .flatMap((r) => walk(path.join(repo, r)))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => /LOCAL_GRANTS_FILE|local-grants|LocalGrant\b/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
