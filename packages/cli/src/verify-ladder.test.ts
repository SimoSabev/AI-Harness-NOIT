import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";
import { mandatVerifyBin, verifyAlias } from "./commands/verify.js";

async function cli(args: string[], env: Record<string, string> = {}) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(["node", "mandat", ...args], { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), env, cwd: process.cwd() });
  return { code, stdout, stderr };
}

describe("mandat ladder sim (т. 5.5)", () => {
  it("≈ 87 при p=0.95, h=5", async () => {
    const r = await cli(["ladder", "sim", "--p", "0.95", "--h", "5", "--runs", "2000"]);
    expect(r.code).toBe(0);
    const mean = Number(/mean ([\d.]+)/.exec(r.stdout)?.[1]);
    expect(Math.abs(mean - 87) / 87).toBeLessThan(0.2);
    const j = await cli(["ladder", "sim", "--p", "1", "--runs", "3", "--json"]);
    expect(JSON.parse(j.stdout)).toMatchObject({ mean: 45, spec: 87 });
    expect((await cli(["ladder", "sim", "--p", "2"])).code).toBe(2);
    expect((await cli(["ladder", "sim", "--p", "x"])).code).toBe(2);
    expect((await cli(["ladder", "sim"])).code).toBe(2);
  });
});

describe("mandat verify = процес mandat-verify (D-238)", () => {
  it("bin-ът е в packages/verify", () => {
    expect(mandatVerifyBin()).toMatch(/packages[/\\]verify[/\\]dist[/\\]main\.js$/);
  });
  it("флаговете минават; exit кодът е на процеса; SUPABASE_* не се подават", async () => {
    const r = await cli(["--home", "/tmp/x", "verify", "--nope"], { SUPABASE_SERVICE_ROLE_KEY: "s" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("mandat-verify: unknown argument --nope");
    let out = "";
    const io = { stdout: (s: string) => (out += s), stderr: () => undefined, env: { SUPABASE_URL: "u", KEEP: "k" }, cwd: process.cwd() };
    const bin = path.join(process.cwd(), "packages/cli/src/env-echo.test-fixture.mjs");
    expect(await verifyAlias(io, ["a"], { home: "/h", bin })).toBe(0);
    expect(JSON.parse(out)).toEqual({ argv: ["--home", "/h", "a"], supabase: [], keep: "k" });
    expect(await verifyAlias(io, [], { bin: "/nonexistent.mjs" })).toBe(1);
  });
});
