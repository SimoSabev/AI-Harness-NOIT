import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DockerRunner } from "@mandat/sandbox";
import { runCli } from "./cli.js";
import { wslDrvFs } from "./commands/doctor.js";
import type { CliDeps } from "./deps.js";

function fakeDocker(o: { proxyRunning: boolean; images?: boolean; version?: string }): DockerRunner {
  return {
    run(args, ro) {
      let out = "";
      let code = 0;
      const a = args.join(" ");
      if (a.startsWith("version")) out = o.version ?? "29.9.1";
      else if (a.includes("SecurityOptions")) out = '["name=seccomp"]';
      else if (a.includes("OperatingSystem")) out = "Ubuntu";
      else if (a.includes("CgroupVersion")) out = "2";
      else if (a.includes("NCPU")) out = "4";
      else if (a.startsWith("image inspect")) code = o.images === false ? 1 : 0;
      else if (a.startsWith("inspect -f {{.State.Running}}")) {
        out = o.proxyRunning ? (a.includes("Config.Image") ? "true mandat-llm-proxy:old" : "true") : "";
        code = o.proxyRunning ? 0 : 1;
      }
      if (out) ro.onStdout?.(Buffer.from(out + "\n"));
      return Promise.resolve({ exitCode: code, timedOut: false });
    },
  };
}

const deps = (o: Parameters<typeof fakeDocker>[0], healthz = 200, proc = "Linux version 6"): CliDeps => ({
  docker: fakeDocker(o),
  healthz: () => Promise.resolve({ ok: healthz === 200, status: healthz }),
  procVersion: () => proc,
  toolVersion: (c) => Promise.resolve(c === "git" ? "2.47.1" : "12.14.0"),
  nodeVersion: "24.22.0",
  bootProxy: () => Promise.resolve(true),
});

async function cli(args: string[], d: CliDeps, env: Record<string, string> = {}) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(["node", "mandat", ...args], { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), env, cwd: process.cwd() }, d);
  return { code, stdout, stderr };
}
const home = () => mkdtempSync(path.join(tmpdir(), "mandat-doc-"));

describe("doctor", () => {
  it("прокси (D-088): спряно = информация, healthz fail = exit 3", async () => {
    const stopped = await cli(["--home", home(), "doctor"], deps({ proxyRunning: false }));
    expect(stopped.stdout).toContain("llm-proxy: not running (needed only for --agent claude)");
    expect(stopped.code).toBe(0);
    const bad = await cli(["--home", home(), "doctor"], deps({ proxyRunning: true }, 500));
    expect(bad.stdout).toContain("llm-proxy: running, healthz fail");
    expect(bad.code).toBe(3);
    const ok = await cli(["--home", home(), "doctor", "--json"], deps({ proxyRunning: true }));
    const j = JSON.parse(ok.stdout.trim()) as { checks: { name: string; ok: boolean }[]; exit: number };
    expect(j.exit).toBe(0);
    expect(j.checks.map((c) => c.name)).toContain("llm-proxy");
  });

  it("WSL DrvFs (D-094)", async () => {
    expect(wslDrvFs("Linux version 5.15 microsoft-standard-WSL2", ["/mnt/c/x/.mandat"])).toBe(true);
    expect(wslDrvFs("Linux version 5.15 microsoft-standard-WSL2", ["/home/u/m/.mandat"])).toBe(false);
    expect(wslDrvFs("Linux version 6", ["/mnt/c/x"])).toBe(false);
    const r = await cli(["--home", "/mnt/c/x/.mandat", "doctor"], deps({ proxyRunning: false }, 200, "Linux microsoft"));
    expect(r.code).toBe(3);
    expect(r.stdout).toContain("E_UNSUPPORTED_FS");
  });

  it("стар docker и липсващи образи → 3", async () => {
    expect((await cli(["--home", home(), "doctor"], deps({ proxyRunning: false, version: "24.0.0" }))).stdout).toContain("E_DOCKER_VERSION");
    const r = await cli(["--home", home(), "doctor"], deps({ proxyRunning: false, images: false }));
    expect(r.code).toBe(3);
    expect(r.stdout).toContain("E_IMAGES_MISSING");
  });

  it("proxy start без ключ → 3; status спряно → 3; stop → 0", async () => {
    const d = deps({ proxyRunning: false });
    const s = await cli(["--home", home(), "proxy", "start"], d);
    expect(s.code).toBe(3);
    expect(s.stderr).toContain("ANTHROPIC_API_KEY");
    expect((await cli(["proxy", "status"], d)).code).toBe(3);
    expect((await cli(["proxy", "stop"], d)).stdout).toBe("stopped\n");
    expect((await cli(["proxy", "status", "--json"], deps({ proxyRunning: true }))).stdout).toContain('"healthz":"ok"');
  });

  it("невалиден MANDAT_PROXY_ADMIN_PORT → 2", async () => {
    expect((await cli(["proxy", "status"], deps({ proxyRunning: false }), { MANDAT_PROXY_ADMIN_PORT: "x" })).code).toBe(2);
  });
});

describe("doctor --report (E7ж)", () => {
  it("prints the anonymous JSON report; the exit code is the same as the plain doctor", async () => {
    const r = await cli(["--home", home(), "doctor", "--report"], deps({ proxyRunning: false }));
    const j = JSON.parse(r.stdout) as { os: string; checks: { name: string; code: string | null }[] };
    expect(j.os).toMatch(/^[a-z0-9]+ \S+$/);
    expect(j.checks.map((c) => c.name)).toContain("node");
    expect(r.stdout).not.toContain((await import("node:os")).homedir());
  });
});
