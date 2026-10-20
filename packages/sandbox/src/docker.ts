import { spawn } from "node:child_process";
import { MandatError } from "@mandat/contract";

export interface DockerRunResult {
  exitCode: number;
  timedOut: boolean;
}
export interface DockerRunner {
  run(
    args: string[],
    o: {
      /** env of the docker CLI process; this is where secret VALUES live (D-043). */
      env: Record<string, string>;
      stdin: "closed" | NodeJS.ReadableStream;
      timeoutMs: number;
      onStdoutLine?(line: string): void;
      onStdout?(chunk: Buffer): void;
      onStderr?(chunk: Buffer): void;
    },
  ): Promise<DockerRunResult>;
}

const HOST_KEYS = ["PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY", "XDG_RUNTIME_DIR"];

/** D-084: only the docker CLI's own keys from the host, plus the secret values (extra wins). Nothing else. */
export function dockerSpawnEnv(processEnv: NodeJS.ProcessEnv, extra: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of HOST_KEYS) {
    const v = processEnv[k];
    if (v !== undefined) out[k] = v;
  }
  return { ...out, ...extra };
}

export function realDockerRunner(): DockerRunner {
  return {
    run(args, o) {
      return new Promise((resolve, reject) => {
        const child = spawn("docker", args, {
          env: dockerSpawnEnv(process.env, o.env),
          stdio: [o.stdin === "closed" ? "ignore" : "pipe", "pipe", "pipe"],
        });
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, o.timeoutMs);
        let buf = "";
        child.stdout?.on("data", (c: Buffer) => {
          o.onStdout?.(c);
          if (o.onStdoutLine) {
            buf += c.toString("utf8");
            let i: number;
            while ((i = buf.indexOf("\n")) >= 0) {
              o.onStdoutLine(buf.slice(0, i));
              buf = buf.slice(i + 1);
            }
          }
        });
        child.stderr?.on("data", (c: Buffer) => o.onStderr?.(c));
        child.on("error", (e) => {
          clearTimeout(timer);
          // Never include spawnargs in the error (D-043).
          reject(new MandatError("E_DOCKER", `cannot run docker: ${e.message}`));
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (o.onStdoutLine && buf.length > 0) o.onStdoutLine(buf);
          resolve({ exitCode: code ?? 137, timedOut });
        });
        if (o.stdin !== "closed" && child.stdin) o.stdin.pipe(child.stdin);
      });
    },
  };
}

/** Runs a short docker command and returns stdout as text. */
export async function dockerText(r: DockerRunner, args: string[], timeoutMs = 30_000): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  const res = await r.run(args, {
    env: {},
    stdin: "closed",
    timeoutMs,
    onStdout: (c) => out.push(c),
    onStderr: (c) => err.push(c),
  });
  return { exitCode: res.timedOut ? 124 : res.exitCode, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") };
}

export type DockerMode = "rootless" | "rootful" | "desktop";

/** D-034. */
export async function detectDockerMode(r: DockerRunner): Promise<DockerMode> {
  const sec = await dockerText(r, ["info", "--format", "{{json .SecurityOptions}}"]);
  if (sec.exitCode !== 0) throw new MandatError("E_DOCKER", "docker info failed", { stderr: sec.stderr.slice(0, 300) });
  if (sec.stdout.includes("name=rootless")) return "rootless";
  const os = await dockerText(r, ["info", "--format", "{{.OperatingSystem}}"]);
  if (os.stdout.includes("Docker Desktop")) return "desktop";
  return "rootful";
}

/** D-034 / D-119: user for proxy and gate containers. */
export function infraUser(mode: DockerMode, ids: { uid: number; gid: number }): string {
  return mode === "rootless" ? "0:0" : `${ids.uid}:${ids.gid}`;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

let ipv6Cache: boolean | undefined;
/** D-152: does the Docker host kernel have IPv6? (If not, the disable_ipv6 sysctl cannot be applied.) */
export async function probeIpv6(r: DockerRunner, image: string): Promise<boolean> {
  if (ipv6Cache !== undefined) return ipv6Cache;
  const res = await dockerText(r, ["run", "--rm", "--network", "none", "--cap-drop=ALL", "--read-only", image, "test", "-e", "/proc/sys/net/ipv6/conf/all/disable_ipv6"], 60_000);
  ipv6Cache = res.exitCode === 0;
  return ipv6Cache;
}
