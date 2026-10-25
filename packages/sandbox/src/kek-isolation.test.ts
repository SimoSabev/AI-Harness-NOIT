import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MandatError } from "@mandat/contract";
import { buildRunArgs, dockerSpawnEnv } from "./index.js";

// E9g A4 (D-374, rule 2/5): the desktop app gives the KEK of the key envelope to `pnpm local` as env MANDAT_KEK. It stays
// on the host: the docker CLI gets only its own keys (D-084), and no sandbox container may name it in -e.
const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-kek-iso-")));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const mandatHome = path.join(tmp, ".mandat");
mkdirSync(path.join(mandatHome, "runs", "r_x"), { recursive: true });
const ctx = { home: tmp, mandatHome, runDir: path.join(mandatHome, "runs", "r_x") };
const agent = { role: "agent" as const, runId: "r_x", image: "img", network: "mandat-r_x", user: "1000:1000" as const, envNames: [] as string[], publicEnv: { MANDAT_TASK: "t_1" }, mounts: [] };
const KEK = Buffer.alloc(32, 7).toString("base64");

describe("the desktop KEK never reaches the sandbox (D-374)", () => {
  it("the docker CLI process does not inherit MANDAT_KEK", () => {
    const env = dockerSpawnEnv({ PATH: "/bin", HOME: "/h", MANDAT_KEK: KEK }, {});
    expect(env).toEqual({ PATH: "/bin", HOME: "/h" });
  });

  it("a container cannot name MANDAT_KEK (envNames or publicEnv), and the args never carry its value", () => {
    expect(() => buildRunArgs({ ...agent, envNames: ["MANDAT_KEK"] }, ctx)).toThrow(MandatError);
    expect(() => buildRunArgs({ ...agent, publicEnv: { MANDAT_KEK: KEK } }, ctx)).toThrow(MandatError);
    expect(buildRunArgs(agent, ctx).join(" ")).not.toContain(KEK);
  });
});
