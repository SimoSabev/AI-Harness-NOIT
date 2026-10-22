import { PROFILE_DIR, buildRunArgs, envForPhase } from "@mandat/sandbox";
import type { DockerRunResult, DockerRunner, MountSpec, RunRole, Tree } from "@mandat/sandbox";
import { gatePaths } from "./gate.js";

export interface SandboxCtx {
  docker: DockerRunner;
  runId: string;
  runDir: string;
  mandatHome: string;
  home: string;
  image: string;
  ipv6Sysctl: boolean;
}

export interface SandboxRun {
  role: Exclude<RunRole, "gate">;
  volume: string;
  volumeReadonly?: boolean;
  /** run network name or "none"; with a run network the tree's resolv.conf/hosts are mounted (D-011, D-081). */
  network: string;
  tree?: Tree;
  env: { phase: "install" | "agent" | "test" | "none"; testsEnv?: Record<string, string>; secrets?: Record<string, string>; tokenName?: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY"; extraPublic?: Record<string, string> };
  /** D-295: the subscription profile volume of the agent (buildRunArgs refuses it for any other role) */
  profile?: string;
  user?: "1000:1000" | "0:0";
  cmd: string[];
  name?: string;
  init?: boolean;
  stdin?: "closed" | NodeJS.ReadableStream;
  timeoutMs: number;
  onStdoutLine?(line: string): void;
  onStdout?(chunk: Buffer): void;
  onStderr?(chunk: Buffer): void;
}

/** One `docker run --rm` of the sandbox image with SANDBOX_HARDENING (D-010). Secret values only in the CLI env. */
export function runSandbox(ctx: SandboxCtx, o: SandboxRun): Promise<DockerRunResult> {
  const mounts: MountSpec[] = [{ kind: "volume", source: o.volume, target: "/m", readonly: o.volumeReadonly === true }];
  if (o.network !== "none" && o.tree !== undefined) {
    const p = gatePaths(ctx.runDir, o.tree);
    mounts.push({ kind: "bind", source: p.resolv, target: "/etc/resolv.conf", readonly: true });
    mounts.push({ kind: "bind", source: p.hosts, target: "/etc/hosts", readonly: true });
  }
  if (o.profile !== undefined) mounts.push({ kind: "volume", source: o.profile, target: PROFILE_DIR, readonly: false });
  const tokenName = o.profile !== undefined && o.env.phase === "agent" ? ("profile" as const) : o.env.tokenName;
  const env = o.env.phase === "none" ? { names: [], publicValues: {} } : envForPhase(o.env.phase, { ...(o.env.testsEnv ? { testsEnv: o.env.testsEnv } : {}), ...(tokenName ? { tokenName } : {}) });
  const secrets = o.env.secrets ?? {};
  const args = buildRunArgs(
    {
      role: o.role, runId: ctx.runId, image: ctx.image, network: o.network, user: o.user ?? "1000:1000", mounts,
      // v5 E8а: extra public env (the control layer's limits) never overrides the phase env; buildRunArgs refuses secret-looking values
      envNames: env.names.filter((n) => n in secrets), publicEnv: { ...(o.env.extraPublic ?? {}), ...env.publicValues }, workdir: "/m/work",
      interactive: o.stdin !== undefined && o.stdin !== "closed", ipv6Sysctl: ctx.ipv6Sysctl,
      ...(o.name !== undefined ? { name: o.name } : {}), ...(o.init ? { init: true } : {}),
    },
    { home: ctx.home, mandatHome: ctx.mandatHome, runDir: ctx.runDir },
  );
  return ctx.docker.run([...args, ...o.cmd], {
    env: secrets,
    stdin: o.stdin ?? "closed",
    timeoutMs: o.timeoutMs,
    ...(o.onStdoutLine ? { onStdoutLine: o.onStdoutLine } : {}),
    ...(o.onStdout ? { onStdout: o.onStdout } : {}),
    ...(o.onStderr ? { onStderr: o.onStderr } : {}),
  });
}

/** D-092: safe read of a file in the volume (FIFO/symlink/dir → null), bounded. */
export async function safeReadVolume(ctx: SandboxCtx, o: { volume: string; file: string; limit: number; role: "export" | "test" }): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  const res = await runSandbox(ctx, {
    role: o.role, volume: o.volume, volumeReadonly: true, network: "none", env: { phase: "none" },
    cmd: ["sh", "-c", `F=${o.file}; test -f "$F" && ! test -L "$F" && head -c ${o.limit} "$F"`],
    timeoutMs: 30_000, onStdout: (c) => chunks.push(c),
  });
  if (res.timedOut || res.exitCode !== 0) return null;
  return Buffer.concat(chunks);
}
