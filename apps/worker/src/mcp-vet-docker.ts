import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpServerRef, ulid } from "@mandat/contract";
import type { Sha256 } from "@mandat/contract";
import { dockerText, imageTags, probeIpv6, realDockerRunner } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { hostConfig, infraUserFor, startRunGate } from "@mandat/verify";
import { NPM_PREFIX_ROUTE, installMcp, mcpNames, vetMcp } from "./mcp-sidecar.js";
import type { McpServerRow, McpVetResult } from "./online/mcp.js";

// E8e (v5 p. 4.5 (3), D-354): the vetting of a catalog server in Docker. Its own run id and gate: the package is installed
// through the gate (npm only), then the server runs once with NO network and the bridge prints what it found.
export async function vetMcpDocker(s: McpServerRow, o: { mandatHome: string; repoRoot: string; env?: Record<string, string | undefined>; docker?: DockerRunner; tarball?: Buffer; secrets?: Record<string, string> }): Promise<McpVetResult> {
  if (s.transport !== "stdio") throw new Error("mcp_vet: http servers are vetted live [НП: E8e remote MCP]");
  const ref = McpServerRef.parse({ name: s.name, transport: "stdio", package: s.package, url: null, version: s.version ?? "0.0.0", digest: null, tools_hash: null, enabled_tools: s.enabled_tools, egress_hosts: s.egress_hosts, secrets: s.secrets });
  const docker = o.docker ?? realDockerRunner();
  const host = hostConfig(o.env ?? process.env);
  const images = await imageTags(o.repoRoot);
  const { user } = await infraUserFor(docker).catch(() => ({ user: "1000:1000" }));
  const ipv6Sysctl = await probeIpv6(docker, images.sandbox);
  const runId = `r_${ulid()}`;
  const runDir = path.join(o.mandatHome, "runs", `mcp-vet-${runId}`);
  mkdirSync(runDir, { recursive: true });
  const sctx = { docker, runId, runDir, mandatHome: o.mandatHome, home: os.homedir(), image: images.sandbox, ipv6Sysctl };
  const gate = await startRunGate({ docker, runId, runDir, mandatHome: o.mandatHome, home: os.homedir(), tree: "agent", gateImage: images.gate, user, extraCa: host.extraCa }, { phase: "install", routes: [NPM_PREFIX_ROUTE] });
  try {
    const installed = await installMcp(sctx, { volume: mcpNames.vol(runId, s.name), network: gate.net, ref, ...(o.tarball ? { tarball: o.tarball } : {}) });
    await gate.stop();
    const line = await vetMcp(sctx, { volume: mcpNames.vol(runId, s.name), ref, installed, secrets: o.secrets ?? {} });
    return { ok: line.state === "serving", hash: line.hash as Sha256, findings: line.findings ?? [], definitions: line.definitions ?? [], digest: installed.integrity };
  } finally {
    await gate.stop().catch(() => undefined);
    const ps = await dockerText(docker, ["ps", "-aq", "--filter", `label=mandat.run=${runId}`]);
    for (const c of ps.stdout.split("\n").filter(Boolean)) await dockerText(docker, ["rm", "-f", c]);
    await dockerText(docker, ["volume", "rm", "-f", mcpNames.vol(runId, s.name)]);
    await dockerText(docker, ["network", "rm", `mandat-net-${runId}-agent`]);
  }
}
