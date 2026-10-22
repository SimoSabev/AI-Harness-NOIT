import { realpathSync } from "node:fs";
import os from "node:os";
import { compareVersions, dockerText, imageTags } from "@mandat/sandbox";
import { doctorDeep, infraUserFor } from "@mandat/worker";
import type { DoctorDeepResult, HostConfig } from "@mandat/worker";
import type { CliDeps } from "../deps.js";
import { printJson } from "../output.js";
import { doctorReport } from "./doctor-report.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** informational checks never fail the command (D-088) */
  info?: boolean;
}

/** D-094: repo or MANDAT_HOME on /mnt/<letter>/ under WSL is not supported. */
export function wslDrvFs(procVersion: string, paths: string[]): boolean {
  if (!/microsoft/i.test(procVersion)) return false;
  return paths.some((p) => /^\/mnt\/[a-z]\//i.test(p));
}

const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

export async function doctor(io: Io, deps: CliDeps, o: { mandatHome: string; host: HostConfig; deep: boolean; keep: boolean; json: boolean; report?: boolean }): Promise<number> {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  add({ name: "node", ok: deps.nodeVersion === "24.22.0", detail: deps.nodeVersion });
  const pnpm = await deps.toolVersion("pnpm");
  add({ name: "pnpm", ok: pnpm === "12.14.0", detail: pnpm ?? "missing" });
  const git = await deps.toolVersion("git");
  add({
    name: "git",
    ok: git !== null && compareVersions(git, "2.43.0") >= 0,
    detail: git === null ? "missing" : compareVersions(git, "2.43.0") >= 0 ? git : `${git} < 2.43.0 (E_GIT_VERSION): brew install git; провери с \`which git\`, че /opt/homebrew/bin/git (или /usr/local/bin/git) е преди /usr/bin/git в PATH`,
  });
  const wsl = wslDrvFs(deps.procVersion(), [real(o.mandatHome), real(repoRoot)]);
  add({ name: "filesystem", ok: !wsl, detail: wsl ? "E_UNSUPPORTED_FS: клонирай в WSL файловата система (~/)" : "ok" });
  const ver = await dockerText(deps.docker, ["version", "--format", "{{.Server.Version}}"]);
  const dv = ver.stdout.trim();
  const dockerOk = ver.exitCode === 0 && compareVersions(dv, "25.0.5") >= 0;
  add({ name: "docker", ok: dockerOk, detail: ver.exitCode !== 0 ? "E_DOCKER: docker is not reachable" : dockerOk ? dv : `${dv} < 25.0.5 (E_DOCKER_VERSION)` });
  let imagesOk = false;
  let tags: Awaited<ReturnType<typeof imageTags>> | null = null;
  if (ver.exitCode === 0) {
    const { mode } = await infraUserFor(deps.docker).catch(() => ({ mode: "rootful" as const }));
    const cg = await dockerText(deps.docker, ["info", "--format", "{{.CgroupVersion}}"]);
    add({ name: "docker mode", ok: true, detail: `${mode}, cgroup v${cg.stdout.trim()}`, info: true });
    const ncpu = Number((await dockerText(deps.docker, ["info", "--format", "{{.NCPU}}"])).stdout.trim());
    add({ name: "cpus", ok: ncpu >= 2, detail: ncpu >= 2 ? String(ncpu) : `E_DOCKER: Docker вижда ${ncpu} CPU; нужни са ≥ 2 (Docker Desktop: Settings → Resources)` });
    tags = await imageTags(repoRoot);
    const missing: string[] = [];
    for (const t of [tags.sandbox, tags.gate, tags.proxy]) if ((await dockerText(deps.docker, ["image", "inspect", t])).exitCode !== 0) missing.push(t);
    imagesOk = missing.length === 0;
    add({ name: "images", ok: imagesOk, detail: imagesOk ? [tags.sandbox, tags.gate, tags.proxy].join("  ") : `E_IMAGES_MISSING: ${missing.join(", ")} (пусни pnpm mandat images build)` });
    const insp = await dockerText(deps.docker, ["inspect", "-f", "{{.State.Running}}", "mandat-llm-proxy"]);
    if (insp.exitCode !== 0 || insp.stdout.trim() !== "true") {
      add({ name: "llm-proxy", ok: true, info: true, detail: "not running (needed only for --agent claude)" });
    } else {
      const h = await deps.healthz(o.host.proxyAdminPort);
      add({ name: "llm-proxy", ok: h.ok, detail: h.ok ? `running, healthz ok (127.0.0.1:${o.host.proxyAdminPort})` : "running, healthz fail" });
    }
  }
  let r14: DoctorDeepResult | null = null;
  if (o.deep && imagesOk && tags !== null) {
    const { user } = await infraUserFor(deps.docker);
    r14 = await doctorDeep({ docker: deps.docker, mandatHome: o.mandatHome, home: os.homedir(), images: tags, infraUser: user, extraCa: o.host.extraCa, keep: o.keep });
    add({ name: "r14", ok: r14.blocked === 8, detail: `R14 probes ${r14.blocked}/8 blocked` });
  }
  const exit = checks.every((c) => c.ok) ? 0 : 3;
  if (o.report) {
    // E7ж: anonymous (no paths, home, user name or IPs) — safe to paste into docs/setup
    printJson(io, doctorReport({ platform: os.platform(), release: os.release(), arch: os.arch(), checks, home: os.homedir(), user: os.userInfo().username }));
    return exit;
  }
  if (o.json) {
    printJson(io, { checks: checks.map(({ name, ok, detail }) => ({ name, ok, detail })), ...(r14 ? { r14: { blocked: r14.blocked, total: 8, probes: r14.probes } } : {}), exit });
  } else {
    for (const c of checks) {
      if (c.name === "llm-proxy") io.stdout(`llm-proxy: ${c.detail}\n`);
      else io.stdout(`${c.name} ${c.detail} ${c.ok ? "✓" : "✗"}\n`);
    }
    if (r14) for (const p of r14.probes) io.stdout(`  ${p.id} ${p.blocked ? "blocked" : "NOT blocked"} (${p.why}) ${p.cmd}\n`);
  }
  return exit;
}
