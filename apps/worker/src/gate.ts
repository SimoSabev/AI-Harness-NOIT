import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { GateLogLine, MandatError } from "@mandat/contract";
import type { GatePolicy, GateRoute } from "@mandat/contract";
import { buildRunArgs, dockerText, names } from "@mandat/sandbox";
import type { DockerRunner, MountSpec, Tree } from "@mandat/sandbox";
import { writeAtomic } from "./fsx.js";

export interface GateCtx {
  docker: DockerRunner;
  runId: string;
  runDir: string;
  mandatHome: string;
  home: string;
  tree: Tree;
  gateImage: string;
  user: string;
  extraCa: string | undefined;
  /** default http://mandat-llm-proxy:8787 (D-048: docker tests point it at a test proxy). */
  llmProxyUrl?: string;
  sleep?: (ms: number) => Promise<void>;
  policyTimeoutMs?: number;
}

/** D-081 file layout: the agent tree keeps gate/policy, gate/log, etc/; base/a/b get their own sub dirs. */
export function gatePaths(runDir: string, tree: Tree) {
  const sub = tree === "agent" ? "" : `${tree}/`;
  return {
    policyDir: path.join(runDir, "gate", `${sub}policy`),
    logDir: path.join(runDir, "gate", `${sub}log`),
    log: path.join(runDir, "gate", `${sub}log`, "events.jsonl"),
    resolv: path.join(runDir, "etc", `${sub}resolv.conf`),
    hosts: path.join(runDir, "etc", `${sub}hosts`),
  };
}

export function readGateLog(file: string): GateLogLine[] {
  if (!existsSync(file)) return [];
  const out: GateLogLine[] = [];
  for (const l of readFileSync(file, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try {
      const r = GateLogLine.safeParse(JSON.parse(l));
      if (r.success) out.push(r.data);
    } catch {
      /* skip */
    }
  }
  return out;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RunGate {
  ip: string;
  net: string;
  name: string;
  paths: ReturnType<typeof gatePaths>;
  setPolicy(phase: GatePolicy["phase"], routes: GateRoute[]): Promise<void>;
  stop(): Promise<void>;
}

/** Writes the policy atomically and waits for the gate's policy_loaded line (D-044; timeout → E_GATE_POLICY). */
async function setPolicyAndWait(ctx: GateCtx, paths: ReturnType<typeof gatePaths>, phase: GatePolicy["phase"], routes: GateRoute[]): Promise<void> {
  const before = readGateLog(paths.log).filter((l) => l.kind === "policy_loaded").length;
  const policy: GatePolicy = { version: 1, run_id: ctx.runId, phase, routes };
  writeAtomic(path.join(paths.policyDir, "policy.json"), JSON.stringify(policy));
  const sleep = ctx.sleep ?? defaultSleep;
  const deadline = ctx.policyTimeoutMs ?? 5000;
  for (let waited = 0; waited <= deadline; waited += 50) {
    const loaded = readGateLog(paths.log).filter((l) => l.kind === "policy_loaded");
    if (loaded.length > before && loaded.at(-1)?.phase === phase) return;
    await sleep(50);
  }
  throw new MandatError("E_GATE_POLICY", `gate did not load policy phase ${phase} within ${deadline} ms`);
}

/** 7.4(5–6): internal network + gate on mandat-upstream and the run network, self-ip, resolv.conf/hosts. */
export async function startRunGate(ctx: GateCtx, initial: { phase: GatePolicy["phase"]; routes: GateRoute[] }): Promise<RunGate> {
  const d = ctx.docker;
  const net = names.net(ctx.runId, ctx.tree);
  const name = names.gate(ctx.runId, ctx.tree);
  const paths = gatePaths(ctx.runDir, ctx.tree);
  const npmCache = path.join(ctx.mandatHome, "cache", "npm");
  for (const dir of [paths.policyDir, paths.logDir, npmCache, path.dirname(paths.resolv)]) mkdirSync(dir, { recursive: true });
  const fail = (msg: string, stderr: string): never => {
    throw new MandatError("E_GATE_START", msg, { stderr: stderr.slice(0, 300) });
  };
  const n = await dockerText(d, ["network", "create", "--internal", "--label", `mandat.run=${ctx.runId}`, net]);
  if (n.exitCode !== 0) fail(`cannot create ${net}`, n.stderr);
  // a) initial policy before the gate starts (atomic).
  writeAtomic(path.join(paths.policyDir, "policy.json"), JSON.stringify({ version: 1, run_id: ctx.runId, phase: initial.phase, routes: initial.routes }));
  const mounts: MountSpec[] = [
    { kind: "bind", source: paths.policyDir, target: "/etc/mandat-gate", readonly: true },
    { kind: "bind", source: paths.logDir, target: "/var/log/mandat-gate", readonly: false },
    { kind: "bind", source: npmCache, target: "/var/cache/mandat-npm", readonly: false },
  ];
  const publicEnv: Record<string, string> = {};
  if (ctx.llmProxyUrl !== undefined) publicEnv.MANDAT_LLM_PROXY_URL = ctx.llmProxyUrl;
  if (ctx.extraCa !== undefined) {
    mounts.push({ kind: "bind", source: ctx.extraCa, target: "/etc/mandat-ca.pem", readonly: true });
    publicEnv.NODE_EXTRA_CA_CERTS = "/etc/mandat-ca.pem";
  }
  const args = buildRunArgs(
    {
      role: "gate", runId: ctx.runId, image: ctx.gateImage, network: "mandat-upstream", user: ctx.user as `${number}:${number}`,
      mounts, envNames: [], publicEnv, detach: true, name, ...(ctx.extraCa !== undefined ? { caFile: ctx.extraCa } : {}),
    },
    { home: ctx.home, mandatHome: ctx.mandatHome, runDir: ctx.runDir },
  );
  const g = await dockerText(d, args, 60_000);
  if (g.exitCode !== 0) fail(`cannot start ${name}`, g.stderr);
  const c = await dockerText(d, ["network", "connect", "--alias", "egress-gate", net, name]);
  if (c.exitCode !== 0) fail(`cannot connect ${name}`, c.stderr);
  const ins = await dockerText(d, ["inspect", "-f", `{{(index .NetworkSettings.Networks "${net}").IPAddress}}`, name]);
  const ip = ins.stdout.trim();
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) fail(`no IP for ${name}`, ins.stderr);
  writeAtomic(path.join(paths.policyDir, "self-ip"), `${ip}\n`);
  writeAtomic(paths.resolv, `nameserver ${ip}\noptions timeout:1 attempts:1\n`);
  writeAtomic(paths.hosts, `127.0.0.1 localhost\n${ip} egress-gate\n`);
  // g) wait for policy_loaded of the initial phase; rewrite once to make sure the gate saw self-ip after start.
  await setPolicyAndWait(ctx, paths, initial.phase, initial.routes);
  return {
    ip, net, name, paths,
    setPolicy: (phase, routes) => setPolicyAndWait(ctx, paths, phase, routes),
    async stop() {
      await dockerText(d, ["rm", "-f", name], 60_000);
      await dockerText(d, ["network", "rm", net], 60_000);
    },
  };
}
