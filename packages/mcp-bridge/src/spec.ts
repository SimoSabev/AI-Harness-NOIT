import { z } from "zod";
import { Sha256 } from "@mandat/contract";

// E8e (D-354): what the worker hands the sidecar (env MANDAT_MCP_SPEC). Secrets are separate env vars named in `secrets`;
// only those (plus PATH/HOME) reach the MCP server process.
export const SidecarSpec = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/),
    command: z.string().min(1).max(200),
    args: z.array(z.string().max(500)).max(50),
    approved_hash: Sha256.nullable(),
    enabled_tools: z.array(z.string().min(1).max(120)).max(200).nullable(),
    secrets: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(20),
  })
  .strict();
export type SidecarSpec = z.infer<typeof SidecarSpec>;

/** The MCP server's env: PATH/HOME and the declared secrets, nothing else of the sidecar's env. */
export function serverEnv(spec: SidecarSpec, env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["PATH", "HOME", ...spec.secrets]) {
    const v = env[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
