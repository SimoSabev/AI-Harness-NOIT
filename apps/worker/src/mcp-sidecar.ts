import { PassThrough } from "node:stream";
import { MandatError } from "@mandat/contract";
import type { GateRoute, McpServerRef } from "@mandat/contract";
import { buildRunArgs, dockerText } from "@mandat/sandbox";
import { runSandbox } from "@mandat/verify";
import type { RunGate } from "@mandat/verify";

type SandboxCtx = Parameters<typeof runSandbox>[0];

// E8e (v5 p. 4.5 (4), AC-5.3, D-354): a stdio MCP server runs in its own sidecar container — the sandbox image with role mcp
// (same hardening), its own volume (never /m/work), its declared secrets only (never in the agent), on an internal
// network that only the gate joins. The agent reaches it as http://egress-gate/mcp/<name> through the bridge.
export const mcpNames = {
  net: (run: string) => `mandat-mcp-${run}`,
  vol: (run: string, name: string) => `mandat-mcp-${run}-${name}`,
  container: (run: string, name: string) => `mandat-mcp-${run}-${name}`,
};
export const BRIDGE = "/opt/mandat/mcp-bridge/dist/main.js";
/** npm through the gate while the harness (never the agent) installs an MCP package. */
export const NPM_PREFIX_ROUTE: GateRoute = { id: "mcp-npm", method: "GET", match: { kind: "prefix", path: "/npm/" }, upstream: "npm_registry" };

// prints {"bin": "<abs path of the bin script>", "integrity": "<lockfile integrity>"} for the installed package
const RESOLVE = `
const fs=require("fs"),p=require("path");const spec=process.argv[1];const name=spec.startsWith("@")?"@"+spec.slice(1).split("@")[0]:spec.split("@")[0];
const dir=p.join("/m/node_modules",name);const pj=JSON.parse(fs.readFileSync(p.join(dir,"package.json"),"utf8"));
const b=typeof pj.bin==="string"?pj.bin:Object.values(pj.bin||{})[0];if(!b){process.stderr.write("no bin\\n");process.exit(3);}
let integ=null;try{integ=JSON.parse(fs.readFileSync("/m/package-lock.json","utf8")).packages["node_modules/"+name].integrity||null}catch{}
process.stdout.write(JSON.stringify({bin:p.join("/m/mcp/node_modules",name,b),integrity:integ})+"\\n");`;

export interface Installed { bin: string; integrity: string | null }

/**
 * Installs ref.package into the server's volume through the gate (install phase, the npm prefix route, scripts off).
 * `tarball` (tests) installs a local package archive instead; its dependencies still come through the gate.
 */
export async function installMcp(ctx: SandboxCtx, o: { volume: string; network: string; ref: McpServerRef; tarball?: Buffer }): Promise<Installed> {
  if (o.ref.transport !== "stdio" || !o.ref.package) throw new MandatError("E_USAGE", "only stdio servers are installed");
  if ((await dockerText(ctx.docker, ["volume", "create", "--label", `mandat.run=${ctx.runId}`, o.volume])).exitCode !== 0) throw new MandatError("E_DOCKER", "mcp volume create failed");
  const target = o.tarball ? "/m/pkg/pkg.tgz" : o.ref.package;
  if (o.tarball) {
    const seed = await runSandbox(ctx, { role: "seed", volume: o.volume, network: "none", env: { phase: "none" }, cmd: ["sh", "-c", "mkdir -p /m/pkg && cat > /m/pkg/pkg.tgz"], stdin: PassThrough.from([o.tarball]) as unknown as NodeJS.ReadableStream, timeoutMs: 60_000 });
    if (seed.exitCode !== 0) throw new MandatError("E_DOCKER", "mcp tarball seed failed");
  }
  const err: Buffer[] = [];
  const r = await runSandbox(ctx, {
    role: "install", volume: o.volume, network: o.network, tree: "agent", env: { phase: "install" },
    cmd: ["npm", "install", "--prefix", "/m", "--registry", "http://egress-gate/npm/", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev", target],
    timeoutMs: 300_000, onStderr: (c) => err.push(c),
  });
  if (r.exitCode !== 0 || r.timedOut) throw new MandatError("E_INSTALL_BASE", `mcp install of ${o.ref.name} failed`, { stderr: Buffer.concat(err).toString("utf8").slice(-300) });
  const out: string[] = [];
  const spec = o.tarball ? JSON.parse((await readPkgName(ctx, o.volume)) ?? "\"\"") as string : o.ref.package;
  const res = await runSandbox(ctx, { role: "export", volume: o.volume, volumeReadonly: true, network: "none", env: { phase: "none" }, cmd: ["node", "-e", RESOLVE, spec], timeoutMs: 60_000, onStdoutLine: (l) => out.push(l) });
  if (res.exitCode !== 0) throw new MandatError("E_DOCKER", `mcp ${o.ref.name}: no bin`);
  return JSON.parse(out.at(-1) ?? "{}") as Installed;
}

async function readPkgName(ctx: SandboxCtx, volume: string): Promise<string | null> {
  const out: string[] = [];
  const r = await runSandbox(ctx, {
    role: "export", volume, volumeReadonly: true, network: "none", env: { phase: "none" },
    cmd: ["node", "-e", 'const l=JSON.parse(require("fs").readFileSync("/m/package.json","utf8"));process.stdout.write(JSON.stringify(Object.keys(l.dependencies||{})[0]||"")+"\\n")'],
    timeoutMs: 60_000, onStdoutLine: (l) => out.push(l),
  });
  return r.exitCode === 0 ? (out.at(-1) ?? null) : null;
}

export interface BridgeLine { event: "vetted" | "serving" | "blocked"; name: string; state?: string; reason?: string | null; hash: string; findings?: { tool: string; reason: string; match: string }[]; definitions?: { name: string; description_hash: string; schema_hash: string }[]; tools?: number }
const parseLine = (l: string): BridgeLine | null => {
  try {
    const j = JSON.parse(l) as BridgeLine;
    return j && typeof j === "object" && typeof j.event === "string" ? j : null;
  } catch {
    return null;
  }
};

function sidecarArgs(ctx: SandboxCtx, o: { volume: string; network: string; name?: string; secrets: string[]; detach: boolean }): string[] {
  return buildRunArgs(
    {
      role: "mcp", runId: ctx.runId, image: ctx.image, network: o.network, user: "1000:1000", mounts: [{ kind: "volume", source: o.volume, target: "/m/mcp", readonly: true }],
      envNames: o.secrets, publicEnv: {}, workdir: "/m/mcp", ipv6Sysctl: ctx.ipv6Sysctl, detach: o.detach, ...(o.name ? { name: o.name } : {}),
    },
    { home: ctx.home, mandatHome: ctx.mandatHome, runDir: ctx.runDir },
  );
}
const specEnv = (ref: McpServerRef, bin: string, approvedHash: string | null) =>
  JSON.stringify({ name: ref.name, command: "node", args: [bin], approved_hash: approvedHash, enabled_tools: ref.enabled_tools, secrets: ref.secrets });

/** Vetting: the server runs once with no network at all; the bridge prints the hash, findings and per-tool hashes. */
export async function vetMcp(ctx: SandboxCtx, o: { volume: string; ref: McpServerRef; installed: Installed; secrets: Record<string, string> }): Promise<BridgeLine> {
  const out: string[] = [];
  const args = sidecarArgs(ctx, { volume: o.volume, network: "none", secrets: Object.keys(o.secrets), detach: false });
  // MANDAT_MCP_SPEC is public (no secret in it); it goes in argv like any public env
  const at = args.indexOf(ctx.image);
  args.splice(at, 0, "-e", `MANDAT_MCP_SPEC=${specEnv(o.ref, o.installed.bin, null)}`);
  const r = await ctx.docker.run([...args, "node", BRIDGE, "--vet"], { env: o.secrets, stdin: "closed", timeoutMs: 120_000, onStdoutLine: (l) => out.push(l) });
  const line = out.map(parseLine).find((x) => x?.event === "vetted");
  if (r.exitCode !== 0 || !line) throw new MandatError("E_DOCKER", `mcp ${o.ref.name}: vetting did not finish`);
  return line;
}

/** Starts the sidecar (detached) on the MCP network and connects the gate to it; resolves with the bridge's first line. */
export async function startSidecar(ctx: SandboxCtx, o: { gate: RunGate; ref: McpServerRef; installed: Installed; secrets: Record<string, string>; timeoutMs?: number }): Promise<{ line: BridgeLine; route: GateRoute[] }> {
  const net = mcpNames.net(ctx.runId);
  const exists = (await dockerText(ctx.docker, ["network", "inspect", net])).exitCode === 0;
  if (!exists) {
    if ((await dockerText(ctx.docker, ["network", "create", "--internal", "--label", `mandat.run=${ctx.runId}`, net])).exitCode !== 0) throw new MandatError("E_DOCKER", "mcp network create failed");
    if ((await dockerText(ctx.docker, ["network", "connect", net, o.gate.name])).exitCode !== 0) throw new MandatError("E_DOCKER", "gate cannot join the mcp network");
  }
  const name = mcpNames.container(ctx.runId, o.ref.name);
  const args = sidecarArgs(ctx, { volume: mcpNames.vol(ctx.runId, o.ref.name), network: net, name, secrets: Object.keys(o.secrets), detach: true });
  const at = args.indexOf(ctx.image);
  args.splice(at, 0, "-e", `MANDAT_MCP_SPEC=${specEnv(o.ref, o.installed.bin, o.ref.tools_hash)}`);
  const r = await ctx.docker.run([...args, "node", BRIDGE], { env: o.secrets, stdin: "closed", timeoutMs: 60_000 });
  if (r.exitCode !== 0) throw new MandatError("E_DOCKER", `mcp ${o.ref.name}: sidecar did not start`);
  const deadline = Date.now() + (o.timeoutMs ?? 60_000);
  for (;;) {
    const line = (await sidecarLines(ctx, name)).find((x) => x.event === "serving" || x.event === "blocked");
    if (line) {
      const target = `http://${name}:8080`;
      const route: GateRoute[] = line.event === "serving"
        ? (["POST", "GET"] as const).map((method) => ({ id: `mcp-${o.ref.name}-${method}`, method, match: { kind: "exact" as const, path: `/mcp/${o.ref.name}` }, upstream: "mcp" as const, mcp: { target, per_min: 60 } }))
        : [];
      return { line, route };
    }
    if (Date.now() > deadline) throw new MandatError("E_DOCKER", `mcp ${o.ref.name}: the bridge did not answer`);
    await new Promise((res) => setTimeout(res, 500));
  }
}

/** The bridge's JSON lines so far (serving / blocked; a rug pull during the run is a later "blocked" line). */
export async function sidecarLines(ctx: SandboxCtx, name: string): Promise<BridgeLine[]> {
  const r = await dockerText(ctx.docker, ["logs", name], 30_000);
  return r.stdout.split("\n").map(parseLine).filter((x): x is BridgeLine => x !== null);
}

export async function stopSidecars(ctx: SandboxCtx, names: string[]): Promise<void> {
  for (const n of names) await dockerText(ctx.docker, ["rm", "-f", mcpNames.container(ctx.runId, n)], 60_000);
  for (const n of names) await dockerText(ctx.docker, ["volume", "rm", "-f", mcpNames.vol(ctx.runId, n)], 60_000);
  await dockerText(ctx.docker, ["network", "rm", mcpNames.net(ctx.runId)], 60_000);
}

