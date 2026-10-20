import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildProxyRunArgs, dockerText, ensureUpstreamNetwork, imageTags } from "@mandat/sandbox";
import { infraUserFor } from "@mandat/worker";
import type { HostConfig } from "@mandat/worker";
import type { CliDeps } from "../deps.js";
import { printJson } from "../output.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

const NAME = "mandat-llm-proxy";

async function containerImage(deps: CliDeps): Promise<{ running: boolean; image: string | null }> {
  const r = await dockerText(deps.docker, ["inspect", "-f", "{{.State.Running}} {{.Config.Image}}", NAME]);
  if (r.exitCode !== 0) return { running: false, image: null };
  const [running, image] = r.stdout.trim().split(" ");
  return { running: running === "true", image: image ?? null };
}

async function waitHealthz(deps: CliDeps, port: number, ms: number): Promise<boolean> {
  for (let t = 0; t < ms; t += 250) {
    if ((await deps.healthz(port)).ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** 6.13 / D-099. ANTHROPIC_API_KEY is read ONLY here, from this command's env, and only passed by name (D-043). */
export async function proxyStart(io: Io, deps: CliDeps, o: { mandatHome: string; host: HostConfig; json: boolean }): Promise<number> {
  const port = o.host.proxyAdminPort;
  const tags = await imageTags(repoRoot);
  const cur = await containerImage(deps);
  if (cur.running && cur.image === tags.proxy && (await deps.healthz(port)).ok) {
    if (o.json) printJson(io, { state: "running", healthz: "ok", port });
    else io.stdout("already running\n");
    return 0;
  }
  const key = io.env.ANTHROPIC_API_KEY;
  if (key === undefined || key === "") {
    io.stderr("задай ANTHROPIC_API_KEY само за тази команда: ANTHROPIC_API_KEY=… pnpm mandat proxy start\n");
    return 3;
  }
  await ensureUpstreamNetwork(deps.docker);
  const dir = path.join(o.mandatHome, "proxy");
  mkdirSync(dir, { recursive: true });
  const secret = path.join(dir, "secret");
  if (!existsSync(secret)) {
    writeFileSync(secret, randomBytes(32), { mode: 0o600 });
    chmodSync(secret, 0o600);
  }
  const recreate = cur.image !== null;
  if (recreate) await dockerText(deps.docker, ["rm", "-f", NAME], 60_000);
  const { user } = await infraUserFor(deps.docker);
  const publicEnv: Record<string, string> = { MANDAT_PROXY_SECRET_FILE: "/var/lib/mandat-proxy/secret" };
  if (o.host.extraCa !== undefined) publicEnv.NODE_EXTRA_CA_CERTS = "/etc/mandat-ca.pem";
  const args = buildProxyRunArgs({
    name: NAME, image: tags.proxy, user, mandatHome: o.mandatHome, publishAdminPort: port,
    envNames: ["ANTHROPIC_API_KEY"], publicEnv, ...(o.host.extraCa !== undefined ? { caFile: o.host.extraCa } : {}),
  });
  // The key value lives only in the env of the docker CLI process; argv has just `-e ANTHROPIC_API_KEY`.
  const started = await deps.docker.run(args, { env: { ANTHROPIC_API_KEY: key }, stdin: "closed", timeoutMs: 60_000 });
  if (started.exitCode !== 0) {
    io.stderr("cannot start mandat-llm-proxy\n");
    return 3;
  }
  if (!(await waitHealthz(deps, port, 10_000))) {
    await dockerText(deps.docker, ["rm", "-f", NAME], 60_000);
    io.stderr("llm-proxy: healthz did not answer within 10 s\n");
    return 3;
  }
  if (o.json) printJson(io, { state: "running", healthz: "ok", port });
  else io.stdout(`${recreate ? "recreated" : "started"}, healthz ok (127.0.0.1:${port})\n`);
  return 0;
}

export async function proxyStop(io: Io, deps: CliDeps, o: { json: boolean; port: number }): Promise<number> {
  await dockerText(deps.docker, ["rm", "-f", NAME], 60_000);
  if (o.json) printJson(io, { state: "stopped", healthz: null, port: o.port });
  else io.stdout("stopped\n");
  return 0;
}

export async function proxyStatus(io: Io, deps: CliDeps, o: { json: boolean; port: number }): Promise<number> {
  const cur = await containerImage(deps);
  if (!cur.running) {
    if (o.json) printJson(io, { state: "stopped", healthz: null, port: o.port });
    else io.stdout("stopped\n");
    return 3;
  }
  const h = await deps.healthz(o.port);
  if (o.json) printJson(io, { state: "running", healthz: h.ok ? "ok" : "fail", port: o.port });
  else io.stdout(h.ok ? `running, healthz ok (127.0.0.1:${o.port})\n` : "running, healthz fail\n");
  return h.ok ? 0 : 3;
}
