import { existsSync } from "node:fs";
import os from "node:os";
import { MandatError } from "@mandat/contract";
import { detectDockerMode, infraUser } from "@mandat/sandbox";
import type { DockerMode, DockerRunner } from "@mandat/sandbox";

/** Host-specific knobs (D-150, D-151) and the Docker mode (D-034). Read once per process. */
export interface HostConfig {
  /** D-150: host path of an extra CA bundle for TLS-intercepting networks; mounted ro only into gate/proxy. */
  extraCa: string | undefined;
  /** D-151: build the sandbox image without apt (curl/dig) where Debian mirrors are unreachable. */
  sandboxApt: boolean;
  proxyAdminPort: number;
}

export function hostConfig(env: Record<string, string | undefined>): HostConfig {
  const ca = env.MANDAT_EXTRA_CA_CERTS;
  if (ca !== undefined && ca !== "" && !existsSync(ca)) throw new MandatError("E_USAGE", `MANDAT_EXTRA_CA_CERTS not found: ${ca}`);
  const port = Number(env.MANDAT_PROXY_ADMIN_PORT ?? "8788");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new MandatError("E_USAGE", "invalid MANDAT_PROXY_ADMIN_PORT");
  return { extraCa: ca === "" ? undefined : ca, sandboxApt: env.MANDAT_SANDBOX_APT !== "0", proxyAdminPort: port };
}

export async function infraUserFor(r: DockerRunner): Promise<{ mode: DockerMode; user: string }> {
  const mode = await detectDockerMode(r);
  const info = os.userInfo();
  return { mode, user: infraUser(mode, { uid: info.uid, gid: info.gid }) };
}
