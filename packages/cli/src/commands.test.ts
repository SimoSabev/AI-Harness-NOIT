import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DockerRunner } from "@mandat/sandbox";
import { runCli } from "./cli.js";
import { formatVerdict } from "./commands/run.js";
import type { CliDeps } from "./deps.js";

type Rule = (args: string[]) => { exit?: number; out?: string } | undefined;
function docker(rules: Rule[], calls: { args: string[]; env: Record<string, string> }[] = []): DockerRunner {
  return {
    run(args, o) {
      calls.push({ args, env: o.env });
      for (const r of rules) {
        const a = r(args);
        if (a) {
          if (a.out) o.onStdout?.(Buffer.from(a.out));
          return Promise.resolve({ exitCode: a.exit ?? 0, timedOut: false });
        }
      }
      return Promise.resolve({ exitCode: 0, timedOut: false });
    },
  };
}
const deps = (d: DockerRunner, healthy = true): CliDeps => ({
  docker: d, healthz: () => Promise.resolve({ ok: healthy, status: healthy ? 200 : null }), procVersion: () => "", toolVersion: () => Promise.resolve("2.47.1"), nodeVersion: "24.22.0",
});
async function cli(args: string[], d: CliDeps, env: Record<string, string> = {}) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(["node", "mandat", ...args], { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), env, cwd: process.cwd() }, d);
  return { code, stdout, stderr };
}
const home = () => mkdtempSync(path.join(tmpdir(), "mandat-cmd-"));

describe("images build", () => {
  it("exists / built / force / apt / CA / провал", async () => {
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    const exists = await cli(["images", "build"], deps(docker([], calls)));
    expect(exists.code).toBe(0);
    expect(exists.stdout.split("\n").filter(Boolean).every((l) => l.endsWith(" exists"))).toBe(true);
    const ca = path.join(home(), "ca.pem");
    (await import("node:fs")).writeFileSync(ca, "x");
    const built: typeof calls = [];
    const b = await cli(["images", "build", "--force"], deps(docker([], built)), { MANDAT_SANDBOX_APT: "0", MANDAT_EXTRA_CA_CERTS: ca });
    expect(b.stdout.split("\n").filter(Boolean).every((l) => l.endsWith(" built"))).toBe(true);
    const sb = built.find((c) => c.args[0] === "build" && c.args.some((x) => x.includes("sandbox")));
    expect(sb?.args).toEqual(expect.arrayContaining(["--no-cache", "--build-arg", "SANDBOX_APT=0", "--secret", `id=extra_ca,src=${ca}`]));
    const failing = await cli(["images", "build"], deps(docker([(a) => (a[0] === "image" ? { exit: 1 } : a[0] === "build" ? { exit: 1 } : undefined)])));
    expect(failing.code).toBe(3);
    expect((await cli(["images", "build"], deps(docker([])), { MANDAT_EXTRA_CA_CERTS: "/nope.pem" })).code).toBe(2);
  });
});

describe("proxy start", () => {
  it("started / already running / recreated; ключът е само в spawn env", async () => {
    const h = home();
    const key = ["sk", "ant", "api03", "x".repeat(40)].join("-");
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    const notRunning = docker([(a) => (a[0] === "inspect" ? { exit: 1 } : undefined), (a) => (a[0] === "info" && a.includes("{{json .SecurityOptions}}") ? { out: "[]" } : undefined)], calls);
    const s = await cli(["--home", h, "proxy", "start"], deps(notRunning), { ANTHROPIC_API_KEY: key });
    expect([s.code, s.stdout]).toEqual([0, "started, healthz ok (127.0.0.1:8788)\n"]);
    expect(statSync(path.join(h, "proxy", "secret")).mode & 0o777).toBe(0o600);
    const run = calls.find((c) => c.args[0] === "run");
    expect(run?.args.join(" ")).not.toContain(key);
    expect(run?.args).toContain("ANTHROPIC_API_KEY");
    expect(run?.env.ANTHROPIC_API_KEY).toBe(key);
    const { imageTags } = await import("@mandat/sandbox");
    const { repoRoot } = await import("./paths.js");
    const tag = (await imageTags(repoRoot)).proxy;
    const same = docker([(a) => (a[0] === "inspect" ? { out: `true ${tag}\n` } : undefined)]);
    expect((await cli(["--home", h, "proxy", "start"], deps(same))).stdout).toBe("already running\n");
    const old = docker([(a) => (a[0] === "inspect" ? { out: "true mandat-llm-proxy:old\n" } : undefined)]);
    expect((await cli(["--home", h, "proxy", "start"], deps(old), { ANTHROPIC_API_KEY: key })).stdout).toBe("recreated, healthz ok (127.0.0.1:8788)\n");
    const sick = await cli(["--home", h, "proxy", "start", "--json"], deps(notRunning, false), { ANTHROPIC_API_KEY: key });
    expect(sick.code).toBe(3);
    const runFail = docker([(a) => (a[0] === "inspect" ? { exit: 1 } : a[0] === "run" ? { exit: 125 } : undefined)]);
    expect((await cli(["--home", h, "proxy", "start"], deps(runFail), { ANTHROPIC_API_KEY: key })).code).toBe(3);
    expect(existsSync(path.join(h, "proxy", "secret"))).toBe(true);
  });
});

describe("run / bench / redteam / fixtures", () => {
  it("непознат агент → 2; preflight грешка → 3 и JSON ред", async () => {
    const d = deps(docker([(a) => (a[0] === "version" ? { out: "24.0.0\n" } : undefined)]));
    expect((await cli(["--home", home(), "run", "--contract", "contracts/fix-discount.json", "--agent", "nope"], d)).code).toBe(2);
    expect((await cli(["--home", home(), "run", "--contract", "contracts/fix-discount.json", "--agent", "nope", "--json"], d)).stdout).toContain('"E_USAGE"');
    const h = home();
    const r = await cli(["--home", h, "run", "--contract", path.resolve("contracts/fix-discount.json"), "--agent", "fake:honest-fix"], d);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("E_DOCKER_VERSION");
    const j = await cli(["--home", h, "run", "--contract", path.resolve("contracts/fix-discount.json"), "--agent", "fake:honest-fix", "--json"], d);
    expect(JSON.parse(j.stdout.trim())).toMatchObject({ error: { code: "E_DOCKER_VERSION" }, exit: 3 });
    expect((await cli(["--home", h, "bench", "--only", "B1"], d)).code).toBe(3);
    expect((await cli(["--home", h, "bench", "--only", "B9"], d)).code).toBe(2);
    expect((await cli(["--home", h, "redteam", "--only", "R5"], d)).code).toBe(3);
    expect((await cli(["--home", h, "redteam", "--only", "R99"], d)).code).toBe(2);
    expect((await cli(["--home", h, "bench", "--json", "--only", "B1"], d)).stdout).toContain('"exit":3');
    expect((await cli(["--home", h, "bench", "--fail-gate"], d)).code).toBe(3);
    expect((await cli(["--home", h, "bench", "--fail-gate", "--json"], d)).stdout).toContain('"exit":3');
  });

  it("fixtures build и formatVerdict", async () => {
    const h = home();
    const a = await cli(["--home", h, "fixtures", "build"], deps(docker([])));
    expect(a.stdout).toMatch(/^base_commit [0-9a-f]{40}\n$/);
    expect((await cli(["--home", h, "fixtures", "build"], deps(docker([])))).stdout).toContain("(unchanged)");
    expect((await cli(["--home", h, "fixtures", "build", "--force"], deps(docker([])))).code).toBe(0);
    const demo = await cli(["--home", h, "fixtures", "build", "--name", "demo-shop"], deps(docker([])));
    expect(demo.stdout).toMatch(/^base_commit [0-9a-f]{40}\nmirror .*demo-shop\.git\n$/);
    expect(demo.stdout.slice(12, 52)).not.toBe(a.stdout.slice(12, 52));
    expect((await cli(["--home", h, "fixtures", "build", "--name", "nope"], deps(docker([])))).code).toBe(2);
    const io = { stdout: () => undefined, stderr: () => undefined, env: {}, cwd: "/x" };
    expect(formatVerdict(io, { verdict: null, exit: 3, runDir: null, ledger: null, agentExit: null, error: { code: "E_DOCKER", message: "m" } })).toBe("ERROR E_DOCKER: m\n");
  });
});
