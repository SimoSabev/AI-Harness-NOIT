import { MandatError } from "@mandat/contract";
import { dockerText } from "./docker.js";
import type { DockerRunner } from "./docker.js";

export const UPSTREAM_NETWORK = "mandat-upstream";

/** Set from the S3 result (D-037, D-073): "gate" = the gate's own DNS answers the sandbox. */
export const DNS_MODE: "gate" | "hosts_only" = "gate";

/** D-047: idempotent; the shared bridge where the proxy and the gates meet. */
export async function ensureUpstreamNetwork(r: DockerRunner): Promise<void> {
  const inspect = await dockerText(r, ["network", "inspect", UPSTREAM_NETWORK]);
  if (inspect.exitCode === 0) return;
  const create = await dockerText(r, ["network", "create", "--label", "mandat.shared=1", UPSTREAM_NETWORK]);
  if (create.exitCode !== 0 && !/already exists/.test(create.stderr)) {
    throw new MandatError("E_DOCKER", "cannot create mandat-upstream", { stderr: create.stderr.slice(0, 300) });
  }
}

export type Tree = "agent" | "base" | "a" | "b";
/** D-047 names. */
export const names = {
  net: (run: string, t: Tree) => `mandat-net-${run}-${t}`,
  gate: (run: string, t: Tree) => `mandat-gate-${run}-${t}`,
  vol: (run: string, t: Tree) => `mandat-vol-${run}-${t}`,
  agent: (run: string) => `mandat-agent-${run}`,
  uiNet: (run: string) => `mandat-ui-${run}`,
  uiApp: (run: string) => `mandat-ui-app-${run}`,
};
