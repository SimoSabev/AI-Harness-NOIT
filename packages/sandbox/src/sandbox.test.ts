import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MandatError } from "@mandat/contract";
import {
  SANDBOX_HARDENING,
  buildProxyRunArgs,
  buildRunArgs,
  compareVersions,
  detectDockerMode,
  dockerSpawnEnv,
  ensureUpstreamNetwork,
  envForPhase,
  PROFILE_DIR,
  profileVolume,
  buildProfileArgs,
  imageTags,
  uiImageTag,
  infraUser,
  runIdTime,
  sandboxHardening,
  sweepOrphans,
} from "./index.js";
import type { DockerRunner, RunSpec } from "./index.js";

const HOME = "/home/simo";
const MH = "/home/simo/mandat/.mandat";
const RUN = "r_01JB8Z3K4M5N6P7Q8R9S0T1V2W";
const RUN_DIR = `${MH}/runs/${RUN}`;
const ctx = { home: HOME, mandatHome: MH, runDir: RUN_DIR };

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof MandatError ? e.code : String(e);
  }
  return undefined;
};

const agentEnv = envForPhase("agent");
const agentSpec: RunSpec = {
  role: "agent",
  runId: RUN,
  image: "mandat-sandbox:cc2.1.302-1a2b3c4d5e6f",
  network: `mandat-net-${RUN}-agent`,
  user: "1000:1000",
  mounts: [
    { kind: "volume", source: `mandat-vol-${RUN}-agent`, target: "/m", readonly: false },
    { kind: "bind", source: `${RUN_DIR}/etc/resolv.conf`, target: "/etc/resolv.conf", readonly: true },
    { kind: "bind", source: `${RUN_DIR}/etc/hosts`, target: "/etc/hosts", readonly: true },
  ],
  envNames: agentEnv.names,
  publicEnv: agentEnv.publicValues,
  workdir: "/m/work",
  name: `mandat-agent-${RUN}`,
  interactive: true,
  init: true,
};

/** Fake runner: records args/env and answers from a script. */
export function fakeRunner(answer: (args: string[]) => { exitCode?: number; stdout?: string } = () => ({})) {
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  const r: DockerRunner = {
    run(args, o) {
      calls.push({ args, env: o.env });
      const a = answer(args);
      if (a.stdout) {
        o.onStdout?.(Buffer.from(a.stdout));
        for (const l of a.stdout.split("\n").filter(Boolean)) o.onStdoutLine?.(l);
      }
      return Promise.resolve({ exitCode: a.exitCode ?? 0, timedOut: false });
    },
  };
  return { r, calls };
}

describe("buildRunArgs", () => {
  it("hardening (8.2) + snapshot; тайните само по име (D-043, D-105); tmpfs с exec (D-104)", () => {
    const args = buildRunArgs(agentSpec, ctx);
    for (const f of sandboxHardening(RUN, "agent")) expect(args).toContain(f);
    expect(args.join(" ")).toContain("--tmpfs /tmp:rw,exec,nosuid,nodev,size=512m");
    expect(args.join(" ")).toContain("--tmpfs /home/agent:rw,exec,nosuid,nodev,size=1g,uid=1000,gid=1000,mode=0700");
    expect(args.join(" ")).toContain("-e ANTHROPIC_API_KEY -e AWS_SECRET_ACCESS_KEY");
    expect(args).toContain("PATH=/usr/local/bin:/usr/bin:/bin");
    expect(args).toContain("HOME=/home/agent");
    expect(args.some((a) => a.startsWith("ANTHROPIC_API_KEY="))).toBe(false);
    expect(args.join(" ")).not.toMatch(/mdt_|sk-ant-/);
    expect(args).toMatchSnapshot();
  });

  it("publicEnv/envNames (D-105)", () => {
    expect(code(() => buildRunArgs({ ...agentSpec, envNames: ["GITHUB_TOKEN"] }, ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildRunArgs({ ...agentSpec, envNames: [], publicEnv: { ANTHROPIC_API_KEY: "x" } }, ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildRunArgs({ ...agentSpec, envNames: ["AWS_SECRET_ACCESS_KEY"], publicEnv: { AWS_SECRET_ACCESS_KEY: "x" } }, ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildRunArgs({ ...agentSpec, publicEnv: { X: "mdt_abc" } }, ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
  });

  it("забранени", () => {
    const bad = [
      { ...agentSpec, publish: ["80:80"] },
      { ...agentSpec, privileged: true },
      { ...agentSpec, mounts: [{ kind: "bind", source: "/var/run/docker.sock", target: "/var/run/docker.sock", readonly: true }] },
      { ...agentSpec, network: "host" },
      { ...agentSpec, network: "container:x" },
      { ...agentSpec, capAdd: ["NET_BIND_SERVICE"] },
      { ...agentSpec, user: "0:0" },
      { ...agentSpec, image: "--privileged" },
      { ...agentSpec, caFile: "/x.pem" },
      { ...agentSpec, name: "bad name" },
      { ...agentSpec, mounts: [{ kind: "volume", source: "/abs", target: "/m", readonly: false }] },
    ];
    for (const s of bad) expect(code(() => buildRunArgs(s as RunSpec, ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(() => buildRunArgs({ ...agentSpec, role: "seed", user: "0:0" }, ctx)).not.toThrow();
  });

  it("$HOME, runDir и gate маунтове (D-066, D-081, D-082, D-118)", () => {
    const bind = (source: string, readonly = true, role: RunSpec["role"] = "agent") =>
      code(() => buildRunArgs({ ...agentSpec, role, user: role === "gate" ? "1000:1000" : "1000:1000", mounts: [{ kind: "bind", source, target: "/x", readonly }] }, ctx));
    expect(bind(HOME)).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(bind("/home")).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(bind(`${RUN_DIR}/etc/resolv.conf`, false)).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(bind(`${RUN_DIR}/etc/resolv.conf`)).toBeUndefined();
    const doctorDir = `${MH}/runs/doctor-01JB8Z3K4M5N6P7Q8R9S0T1V2W`;
    expect(code(() => buildRunArgs({ ...agentSpec, mounts: [{ kind: "bind", source: `${doctorDir}/etc/hosts`, target: "/etc/hosts", readonly: true }] }, { ...ctx, runDir: doctorDir }))).toBeUndefined();
    expect(bind(`${RUN_DIR}/etc/a/resolv.conf`)).toBeUndefined();
    expect(bind(`${RUN_DIR}/gate/policy/policy.json`)).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildRunArgs(agentSpec, { ...ctx, runDir: "/tmp/elsewhere" }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildRunArgs(agentSpec, { ...ctx, runDir: "relative/runs/x" }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(bind(`${RUN_DIR}/gate/log`, false, "gate")).toBeUndefined();
    expect(bind(`${RUN_DIR}/gate/a/log`, false, "gate")).toBeUndefined();
    expect(bind(`${RUN_DIR}/gate/policy`, true, "gate")).toBeUndefined();
    expect(bind(`${RUN_DIR}/gate/b/policy`, true, "gate")).toBeUndefined();
    expect(bind(`${MH}/cache/npm`, false, "gate")).toBeUndefined();
    expect(bind(`${RUN_DIR}/gate/policy`, false, "gate")).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(bind(`${MH}/proxy`, true, "gate")).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(bind(`${MH}/cache`, false, "gate")).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(bind("relative/path")).toBe("E_FORBIDDEN_DOCKER_FLAG");
  });

  it("gate: без sysctl, по-малки лимити, NET_BIND_SERVICE и CA файл (D-150)", () => {
    const g = sandboxHardening(RUN, "gate");
    expect(g).not.toContain("--sysctl");
    expect(g).toContain("--pids-limit=128");
    expect(g).toContain("--memory=256m");
    expect(g).toContain("mandat.role=gate");
    const gateSpec: RunSpec = {
      role: "gate", runId: RUN, image: "mandat-egress-gate:v0.1.0-x", network: "mandat-upstream", user: "0:0",
      mounts: [{ kind: "bind", source: "/root/ca.pem", target: "/etc/mandat-ca.pem", readonly: true }],
      envNames: [], publicEnv: {}, detach: true, name: `mandat-gate-${RUN}-agent`, capAdd: ["NET_BIND_SERVICE"], caFile: "/root/ca.pem",
    };
    const args = buildRunArgs(gateSpec, ctx);
    expect(args.slice(0, 2)).toEqual(["run", "-d"]);
    expect(args).toContain("--cap-add=NET_BIND_SERVICE");
    expect(code(() => buildRunArgs({ ...gateSpec, caFile: "/other.pem" }, ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildRunArgs({ ...gateSpec, capAdd: ["SYS_ADMIN" as "NET_BIND_SERVICE"] }, ctx))).toBe("E_FORBIDDEN_DOCKER_FLAG");
  });

  it("ipv6Sysctl false маха само --sysctl (D-152)", () => {
    const a = buildRunArgs({ ...agentSpec, ipv6Sysctl: false }, ctx);
    expect(a).not.toContain("--sysctl");
    expect(a).toContain("--cap-drop=ALL");
    expect(buildRunArgs(agentSpec, ctx)).toContain("--sysctl");
  });

  it("SANDBOX_HARDENING е шаблонът", () => {
    expect(SANDBOX_HARDENING).toContain("--log-driver=none");
    expect(sandboxHardening(RUN, "test")).toContain("mandat.role=test");
  });
});

describe("buildProxyRunArgs (D-083)", () => {
  const base = {
    name: "mandat-llm-proxy" as const, image: "mandat-llm-proxy:v0.1.0-abc", user: "1000:1000", mandatHome: MH,
    publishAdminPort: 8788, envNames: ["ANTHROPIC_API_KEY"], publicEnv: { MANDAT_PROXY_SECRET_FILE: "/var/lib/mandat-proxy/secret" },
  };
  it("snapshot и варианти", () => {
    const a = buildProxyRunArgs(base);
    expect(a.join(" ")).toContain("-p 127.0.0.1:8788:8788");
    expect(a.join(" ")).toContain("--restart unless-stopped");
    expect(a.join(" ")).toContain("-e ANTHROPIC_API_KEY");
    expect(a).toContain("MANDAT_PROXY_SECRET_FILE=/var/lib/mandat-proxy/secret");
    expect(a.some((x) => x.startsWith("ANTHROPIC_API_KEY="))).toBe(false);
    expect(a).toMatchSnapshot();
    const t = buildProxyRunArgs({ ...base, name: "mandat-llm-proxy-test-x", publishAdminPort: null, envNames: [] });
    expect(t).not.toContain("-p");
    expect(t).not.toContain("--restart");
    expect(code(() => buildProxyRunArgs({ ...base, envNames: ["ANTHROPIC_API_KEY=sk"] }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildProxyRunArgs({ ...base, publicEnv: { ANTHROPIC_API_KEY: "x" } }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildProxyRunArgs({ ...base, privileged: true } as typeof base))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildProxyRunArgs({ ...base, publishAdminPort: 0 }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildProxyRunArgs({ ...base, name: "evil" as "mandat-llm-proxy" }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(code(() => buildProxyRunArgs({ ...base, command: ["-v", "/var/run/docker.sock:/s"] }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    expect(buildProxyRunArgs({ ...base, caFile: "/ca.pem" }).join(" ")).toContain("/ca.pem:/etc/mandat-ca.pem:ro");
  });
});

describe("env", () => {
  it("dockerSpawnEnv (D-084)", () => {
    const pe = { PATH: "/bin", HOME: "/home/simo", DOCKER_HOST: "unix:///x", XDG_RUNTIME_DIR: "/run/user/1", ANTHROPIC_API_KEY: "k", AWS_SECRET_ACCESS_KEY: "a", GITHUB_TOKEN: "g" };
    expect(dockerSpawnEnv(pe, {})).toEqual({ PATH: "/bin", HOME: "/home/simo", DOCKER_HOST: "unix:///x", XDG_RUNTIME_DIR: "/run/user/1" });
    expect(dockerSpawnEnv(pe, { ANTHROPIC_API_KEY: "t" }).ANTHROPIC_API_KEY).toBe("t");
    expect("DOCKER_CONTEXT" in dockerSpawnEnv(pe, {})).toBe(false);
  });

  it("env по фаза (8.2)", () => {
    expect(Object.keys(envForPhase("install").publicValues).sort()).toEqual(
      ["CI", "HOME", "LANG", "NPM_CONFIG_REGISTRY", "PATH", "YARN_CACHE_FOLDER", "YARN_DISABLE_SELF_UPDATE_CHECK", "YARN_REGISTRY", "npm_config_audit", "npm_config_cache", "npm_config_fund", "npm_config_manage_package_manager_versions", "npm_config_package_import_method", "npm_config_replace_registry_host", "npm_config_store_dir", "npm_config_update_notifier"].sort(),
    );
    const a = envForPhase("agent");
    expect(a.names).toEqual(["ANTHROPIC_API_KEY", "AWS_SECRET_ACCESS_KEY"]);
    expect(Object.keys(a.publicValues).sort()).toEqual(
      ["ANTHROPIC_BASE_URL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "CI", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "CLAUDE_CONFIG_DIR", "DISABLE_AUTOUPDATER", "DISABLE_UPDATES", "HOME", "LANG", "MANDAT_NOTES", "PATH", "npm_config_offline", "npm_config_update_notifier"].sort(),
    );
    expect("MANDAT_REPORT" in a.publicValues).toBe(false);
    const t = envForPhase("test", { testsEnv: { CI: "true", FOO: "1" } });
    expect(t.publicValues).toMatchObject({ MANDAT_REPORT: "/m/out/report.json", FOO: "1" });
    expect(code(() => envForPhase("test", { testsEnv: { ANTHROPIC_API_KEY: "x" } }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
    // E3в: Codex gets OPENAI_API_KEY (the mdt_ token) and CODEX_HOME; no Anthropic variables
    const cx = envForPhase("agent", { tokenName: "OPENAI_API_KEY" });
    expect(cx.names).toEqual(["OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY"]);
    expect(cx.publicValues.CODEX_HOME).toBe("/m/codex-home");
    expect(Object.keys(cx.publicValues).some((k) => k.startsWith("ANTHROPIC_"))).toBe(false);
    expect(code(() => envForPhase("test", { testsEnv: { OPENAI_API_KEY: "x" } }))).toBe("E_FORBIDDEN_DOCKER_FLAG");
  });
});

describe("docker helpers", () => {
  it("detectDockerMode + infraUser (D-034)", async () => {
    const mk = (sec: string, os: string) =>
      fakeRunner((args) => ({ stdout: args.includes("{{json .SecurityOptions}}") ? sec : os })).r;
    expect(await detectDockerMode(mk('["name=seccomp","name=rootless"]', "Ubuntu"))).toBe("rootless");
    expect(await detectDockerMode(mk('["name=seccomp"]', "Docker Desktop"))).toBe("desktop");
    expect(await detectDockerMode(mk('["name=seccomp"]', "Ubuntu 24.04"))).toBe("rootful");
    await expect(detectDockerMode(fakeRunner(() => ({ exitCode: 1 })).r)).rejects.toThrow();
    expect(infraUser("rootless", { uid: 1000, gid: 1000 })).toBe("0:0");
    expect(infraUser("rootful", { uid: 1001, gid: 1002 })).toBe("1001:1002");
    expect(infraUser("desktop", { uid: 501, gid: 20 })).toBe("501:20");
  });

  it("ensureUpstreamNetwork е идемпотентна", async () => {
    const exists = fakeRunner(() => ({ exitCode: 0 }));
    await ensureUpstreamNetwork(exists.r);
    expect(exists.calls).toHaveLength(1);
    const missing = fakeRunner((a) => ({ exitCode: a[1] === "inspect" ? 1 : 0 }));
    await ensureUpstreamNetwork(missing.r);
    expect(missing.calls[1]?.args).toEqual(["network", "create", "--label", "mandat.shared=1", "mandat-upstream"]);
    await expect(ensureUpstreamNetwork(fakeRunner(() => ({ exitCode: 1 })).r)).rejects.toThrow();
  });

  it("sweepOrphans по времето в ULID", async () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const t = runIdTime(RUN);
    expect(t).not.toBeNull();
    expect(runIdTime("nope")).toBeNull();
    const oldRun = RUN; // 2024 time → old
    const f = fakeRunner((a) => {
      if (a[0] === "ps") return { stdout: `c1 ${oldRun}\nc2 r_ZZZZZZZZZZ0000000000000000\n` };
      if (a[0] === "network" && a[1] === "ls") return { stdout: `n1 ${oldRun}\n` };
      if (a[0] === "volume" && a[1] === "ls") return { stdout: `v1 ${oldRun}\n` };
      return {};
    });
    const r = await sweepOrphans(f.r, { olderThanMs: 2 * 3600_000, now });
    expect(r).toEqual({ containers: 1, networks: 1, volumes: 1 });
    expect(f.calls.map((c) => c.args.slice(0, 3).join(" "))).toContain("rm -f c1");
  });

  it("compareVersions", () => {
    expect(compareVersions("25.0.5", "25.0.5")).toBe(0);
    expect(compareVersions("24.0.0", "25.0.5")).toBeLessThan(0);
    expect(compareVersions("29.9.1", "25.0.5")).toBeGreaterThan(0);
    expect(compareVersions("2.43.0", "2.43.0")).toBe(0);
  });
});

describe("imageTags (D-053)", () => {
  it("детерминистичен; 1 байт в egress-gate сменя само gate", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mandat-img-"));
    const w = (p: string, c: string) => {
      mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
      writeFileSync(path.join(root, p), c);
    };
    for (const f of ["package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "turbo.json", ".dockerignore", "pnpm-lock.yaml"]) w(f, f);
    for (const d of ["sandbox", "egress-gate", "llm-proxy"]) w(`docker/${d}/Dockerfile`, d);
    const pkg = (n: string, deps: string[]) => {
      w(`packages/${n}/package.json`, JSON.stringify({ name: `@mandat/${n}`, version: "0.1.0", dependencies: Object.fromEntries(deps.map((d) => [`@mandat/${d}`, "workspace:*"])) }));
      w(`packages/${n}/src/index.ts`, n);
    };
    pkg("contract", []);
    pkg("redaction", []);
    pkg("egress-gate", ["contract", "redaction"]);
    pkg("llm-proxy", ["contract"]);
    w("packages/agents/fakes/x.mjs", "x");
    const a = await imageTags(root);
    expect(await imageTags(root)).toEqual(a);
    expect(a.sandbox).toMatch(/^mandat-sandbox:cc2\.1\.302-[0-9a-f]{12}$/);
    expect(a.gate).toMatch(/^mandat-egress-gate:v0\.1\.0-[0-9a-f]{12}$/);
    w("packages/egress-gate/src/index.ts", "egress-gate!");
    const b = await imageTags(root);
    expect(b.gate).not.toBe(a.gate);
    expect(b.proxy).toBe(a.proxy);
    expect(b.sandbox).toBe(a.sandbox);
    w("packages/contract/src/index.ts", "changed");
    const c = await imageTags(root);
    expect(c.proxy).not.toBe(b.proxy);
  });
});

describe("uiImageTag (E9б, D12)", () => {
  it("the Playwright version and a hash of the UI Dockerfile and runner; a change in the runner changes it", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mandat-uiimg-"));
    const w = (p: string, c: string) => {
      mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
      writeFileSync(path.join(root, p), c);
    };
    w("docker/sandbox-ui/Dockerfile", "FROM x");
    w("packages/verify/ui-runner/ui-run.mjs", "a");
    const a = uiImageTag(root);
    expect(a).toMatch(/^mandat-sandbox-ui:pw1\.63\.0-[0-9a-f]{12}$/);
    w("packages/verify/ui-runner/ui-run.mjs", "b");
    expect(uiImageTag(root)).not.toBe(a);
  });
});

describe("subscription profiles (D-295)", () => {
  it("profileVolume: provider + a short slug; anything else is refused", () => {
    expect(profileVolume("claude", "work")).toBe("mandat-profile-claude-work");
    expect(profileVolume("claude", "default")).toBe("mandat-profile-claude-default");
    for (const bad of ["", "Work", "a b", "../x", "x".repeat(33)]) expect(() => profileVolume("claude", bad)).toThrow(MandatError);
  });
  it("agent env with a profile: no API key name, CLAUDE_CONFIG_DIR on the profile, HTTPS_PROXY = the gate", () => {
    const e = envForPhase("agent", { tokenName: "profile" });
    expect(e.names).toEqual(["AWS_SECRET_ACCESS_KEY"]);
    expect(e.publicValues).toMatchObject({ CLAUDE_CONFIG_DIR: PROFILE_DIR, HTTPS_PROXY: "http://egress-gate:80", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" });
    expect(e.publicValues.ANTHROPIC_BASE_URL).toBeUndefined();
  });
  it("a profile volume: only role agent, only at PROFILE_DIR", () => {
    const vol = profileVolume("claude", "work");
    const spec = (role: "agent" | "test" | "export", target = PROFILE_DIR) => ({
      role, runId: "r_x", image: "img", network: "none", user: "1000:1000" as const, envNames: [], publicEnv: {},
      mounts: [{ kind: "volume" as const, source: vol, target, readonly: false }],
    });
    expect(buildRunArgs(spec("agent"), ctx)).toEqual(expect.arrayContaining(["-v", `${vol}:${PROFILE_DIR}`]));
    expect(() => buildRunArgs(spec("test"), ctx)).toThrow(/profile/);
    expect(() => buildRunArgs(spec("export"), ctx)).toThrow(/profile/);
    expect(() => buildRunArgs(spec("agent", "/m/work/x"), ctx)).toThrow(/profile/);
  });
});

describe("profile helper containers (D-295)", () => {
  const vol = profileVolume("claude", "work");
  it("login: -it, mandat-upstream, uid 1000, cap-drop ALL, no-new-privileges, the unmodified claude auth login", () => {
    const a = buildProfileArgs("login", { image: "img", volume: vol });
    expect(a.slice(0, 3)).toEqual(["run", "--rm", "-it"]);
    expect(a).toEqual(expect.arrayContaining(["--network", "mandat-upstream", "--user", "1000:1000", "--cap-drop=ALL", "--security-opt=no-new-privileges", "-v", `${vol}:${PROFILE_DIR}`, "-e", `CLAUDE_CONFIG_DIR=${PROFILE_DIR}`]));
    expect(a.slice(a.indexOf("img"))).toEqual(["img", "auth", "login", "--claudeai"]);
    expect(a.join(" ")).not.toMatch(/privileged|docker\.sock|--cap-add|-p /);
  });
  it("status: --network none, read-only volume, json; logout: none network; init: root only for chown, no network", () => {
    const s = buildProfileArgs("status", { image: "img", volume: vol });
    expect(s).toEqual(expect.arrayContaining(["--network", "none", "-v", `${vol}:${PROFILE_DIR}:ro`]));
    expect(s.slice(s.indexOf("img"))).toEqual(["img", "auth", "status", "--json"]);
    const o = buildProfileArgs("logout", { image: "img", volume: vol });
    expect(o.slice(o.indexOf("img"))).toEqual(["img", "auth", "logout"]);
    const i = buildProfileArgs("init", { image: "img", volume: vol });
    expect(i).toEqual(expect.arrayContaining(["--network", "none", "--user", "0:0"]));
    expect(i.slice(i.indexOf("img"))).toEqual(["img", "-c", `chown 1000:1000 ${PROFILE_DIR}`]);
    expect(() => buildProfileArgs("status", { image: "img", volume: "mandat-run-x" })).toThrow(MandatError);
  });
});
