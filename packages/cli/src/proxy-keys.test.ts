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
function deps(calls: { args: string[]; env: Record<string, string> }[], boots: Record<string, unknown>[], bootOk = true): CliDeps {
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
    const boots: Record<string, unknown>[] = [];
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

// D-393: a saved connection alone (DeepSeek, Ollama…) is enough to start the proxy; its upstream goes in the boot payload.
describe("proxy start with saved connections (D-393)", () => {
  it("no Anthropic key, one local connection → started; the boot payload carries the upstream, not a provider key", async () => {
    const { ConnectionStore } = await import("@mandat/llm-proxy");
    const home = mkdtempSync(path.join(tmpdir(), "pk-"));
    new ConnectionStore(home, loadKek({ env: {}, mandatHome: home })).put({ id: "ollama", provider: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434", models: ["qwen3-coder"], defaultModel: "qwen3-coder" });
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    const boots: Record<string, unknown>[] = [];
    expect(await proxyStart(io({}), deps(calls, boots), { mandatHome: home, host: hostConfig({}), json: true })).toBe(0);
    expect(boots).toEqual([{ upstreams: { ollama: { wire: "anthropic", url: "http://host.docker.internal:11434", auth: "none", key: "", models: ["qwen3-coder"], prices: { "qwen3-coder": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }, local: true } } }]);
  });
  it("D-422: MANDAT_UPSTREAM_LOCAL_* reach the proxy container as public env and are enough to start without a key", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "pk-"));
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    const boots: Record<string, unknown>[] = [];
    const env = { MANDAT_UPSTREAM_LOCAL_OLLAMA: "http://127.0.0.1:11434", MANDAT_UPSTREAM_LOCAL_OLLAMA_MODELS: "qwen3-coder", MANDAT_UPSTREAM_LOCAL_OLLAMA_WIRE: "anthropic", MANDAT_UPSTREAM_LOCALX: "no" };
    expect(await proxyStart(io(env), deps(calls, boots), { mandatHome: home, host: hostConfig({}), json: true })).toBe(0);
    const run = calls.find((c) => c.args[0] === "run")?.args ?? [];
    for (const kv of ["MANDAT_UPSTREAM_LOCAL_OLLAMA=http://127.0.0.1:11434", "MANDAT_UPSTREAM_LOCAL_OLLAMA_MODELS=qwen3-coder", "MANDAT_UPSTREAM_LOCAL_OLLAMA_WIRE=anthropic"]) expect(run).toContain(kv);
    expect(run.join(" ")).not.toContain("LOCALX");
    expect(boots).toEqual([{}]);
  });
});

// D-440: the Exa key from „Ключове“ is sealed as research:exa; the proxy picks it up from the store (no EXA_API_KEY in
// any env) and it is enough on its own to start the proxy; MANDAT_PROXY_PROVIDERS names it, never its value.
describe("the research search key in the store (D-440)", () => {
  const EXA = ["exa", "z".repeat(36)].join("-");
  it("setSearchKey seals it; proxy start (no env) boots with it alone; removing it leaves nothing to start", async () => {
    const { setSearchKey } = await import("./commands/proxy.js");
    const { proxyProviders } = await import("./commands/proxy.js");
    const home = mkdtempSync(path.join(tmpdir(), "pk-"));
    setSearchKey({ mandatHome: home, env: {} }, "exa", EXA);
    expect(readFileSync(path.join(home, "keys.sealed.json"), "utf8")).not.toContain(EXA);
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    const boots: Record<string, unknown>[] = [];
    expect(await proxyStart(io({}), deps(calls, boots), { mandatHome: home, host: hostConfig({}), json: true })).toBe(0);
    expect(boots).toEqual([{ search: { exa: EXA } }]);
    const run = calls.find((c) => c.args[0] === "run");
    expect(run?.args).toContain("MANDAT_PROXY_PROVIDERS=exa");
    for (const c of calls) expect(JSON.stringify(c)).not.toContain(EXA);
    setSearchKey({ mandatHome: home, env: {} }, "exa", null);
    expect(new FileKeyStore(home, loadKek({ env: {}, mandatHome: home })).get("research:exa")).toBeNull();
    expect(await proxyStart(io({}), deps(calls, []), { mandatHome: home, host: hostConfig({}), json: true })).toBe(3);
    // the running proxy's providers: the names from its public env, exa included
    const { imageTags } = await import("@mandat/sandbox");
    const { repoRoot } = await import("./paths.js");
    const tag = (await imageTags(repoRoot)).proxy;
    const insp: DockerRunner = { run: (args, o) => (o.onStdout?.(Buffer.from(args.includes("{{.State.Running}} {{.Config.Image}}") ? `true ${tag}\n` : "MANDAT_PROXY_PROVIDERS=anthropic,exa\n")), Promise.resolve({ exitCode: 0, timedOut: false })) };
    expect(await proxyProviders({ ...deps([], []), docker: insp })).toEqual(["anthropic", "exa"]);
  });
});
