// Helpers for *.docker.test.ts (not exported from index). They use the real images and the real Docker.
import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ulid } from "@mandat/contract";
import { dockerText, ensureUpstreamNetwork, imageTags, names, probeIpv6, realDockerRunner } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { hostConfig, infraUserFor } from "./host.js";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export async function dockerEnv() {
  const docker: DockerRunner = realDockerRunner();
  const images = await imageTags(repoRoot);
  for (const t of [images.sandbox, images.gate, images.proxy]) {
    if ((await dockerText(docker, ["image", "inspect", t])).exitCode !== 0) throw new Error(`image missing: ${t} (pnpm mandat images build)`);
  }
  await ensureUpstreamNetwork(docker);
  const host = hostConfig(process.env);
  const { user, mode } = await infraUserFor(docker);
  const ipv6Sysctl = await probeIpv6(docker, images.sandbox);
  return { docker, images, host, user, mode, ipv6Sysctl };
}

export function tempRun() {
  const mandatHome = mkdtempSync(path.join(os.tmpdir(), "mandat-dt-"));
  const id = ulid();
  const runId = `r_${id}`;
  const runDir = path.join(mandatHome, "runs", runId);
  mkdirSync(runDir, { recursive: true });
  return { mandatHome, runId, runDir, home: os.homedir() };
}

export async function cleanupRun(docker: DockerRunner, runId: string): Promise<void> {
  const ps = await dockerText(docker, ["ps", "-aq", "--filter", `label=mandat.run=${runId}`]);
  for (const c of ps.stdout.split("\n").filter(Boolean)) await dockerText(docker, ["rm", "-f", c]);
  for (const t of ["agent", "base", "a", "b"] as const) {
    await dockerText(docker, ["network", "rm", names.net(runId, t)]);
    await dockerText(docker, ["volume", "rm", "-f", names.vol(runId, t)]);
  }
}
