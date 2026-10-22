import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileKeyStore, loadKek } from "@mandat/llm-proxy";
import type { DockerRunner } from "@mandat/sandbox";
import { hostConfig } from "@mandat/worker";
import { proxyStart } from "./commands/proxy.js";
import type { CliDeps } from "./deps.js";

const KEY = ["sk", "ant", "api03", "q".repeat(40)].join("-");
function deps(calls: { args: string[]; env: Record<string, string> }[], boots: Record<string, string>[], bootOk = true): CliDeps {
  const docker: DockerRunner = {
    run(args, o) {
      calls.push({ args, env: o.env });
      if (args[0] === "inspect") return Promise.resolve({ exitCode: 1, timedOut: false });
      if (args[0] === "info") o.onStdout?.(Buffer.from("[]"));
      return Promise.resolve({ exitCode: 0, timedOut: false });
    },
  };
  return {
    docker, healthz: () => Promise.resolve({ ok: true, status: 200 }), procVersion: () => "", toolVersion: () => Promise.resolve("2.47.1"), nodeVersion: "24.22.0",
    bootProxy: (_p, _t, keys) => {
      boots.push({ ...keys });
      return Promise.resolve(bootOk);
    },
  };
}
const io = (env: Record<string, string>) => ({ stdout: () => undefined, stderr: () => undefined, env, cwd: process.cwd() });

describe("proxy start with sealed keys (E7в, AC-3.8)", () => {
  it("a key from env is sealed into the store; the next start (no env) uses the store", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "pk-"));
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    const boots: Record<string, string>[] = [];
    expect(await proxyStart(io({ ANTHROPIC_API_KEY: KEY }), deps(calls, boots), { mandatHome: home, host: hostConfig({}), json: true })).toBe(0);
    expect(readFileSync(path.join(home, "keys.sealed.json"), "utf8")).not.toContain(KEY);
    expect(new FileKeyStore(home, loadKek({ env: {}, mandatHome: home })).get("anthropic")).toBe(KEY);
    expect(await proxyStart(io({}), deps(calls, boots), { mandatHome: home, host: hostConfig({}), json: true })).toBe(0);
    expect(boots).toEqual([{ anthropic: KEY }, { anthropic: KEY }]);
    for (const c of calls) expect(JSON.stringify(c)).not.toContain(KEY);
  });
  it("no key in env and none stored → exit 3 with a hint; a failed boot → the container is removed, exit 3", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "pk-"));
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    expect(await proxyStart(io({}), deps(calls, []), { mandatHome: home, host: hostConfig({}), json: true })).toBe(3);
    expect(await proxyStart(io({ ANTHROPIC_API_KEY: KEY }), deps(calls, [], false), { mandatHome: home, host: hostConfig({}), json: true })).toBe(3);
    expect(calls.filter((c) => c.args[0] === "rm" && c.args.includes("mandat-llm-proxy")).length).toBeGreaterThan(0);
  });
});
