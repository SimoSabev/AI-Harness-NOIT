import { z } from "zod";
import { RunId } from "./schemas.js";

// D-032: single source of the gate types; channels and egress-gate import these.
export const GateRouteSchema = z
  .object({
    id: z.string().min(1),
    method: z.enum(["GET", "POST", "HEAD"]),
    match: z.object({ kind: z.enum(["exact", "prefix"]), path: z.string().startsWith("/") }),
    upstream: z.enum(["llm_proxy", "npm_registry", "local_ok", "mcp"]),
    /** E8e (D-354): an MCP sidecar on the run's MCP network (plain HTTP, internal) and its call budget per minute */
    mcp: z.object({ target: z.string().regex(/^http:\/\/[a-z0-9_.-]{1,200}(:\d{1,5})?$/), per_min: z.number().int().min(1).max(10_000) }).strict().optional(),
  })
  .strict()
  .refine((r) => (r.upstream === "mcp") === (r.mcp !== undefined), { message: "an mcp route (and only an mcp route) has an mcp target" });
export type GateRoute = z.infer<typeof GateRouteSchema>;

export const GatePhase = z.enum(["install", "agent", "closed"]);
// D-294: the only CONNECT the gate ever opens — an exact host:port (the Claude subscription channel talks TLS end to end
// with Anthropic; the gate never sees the credential).
export const GateTunnelSchema = z.object({ host: z.string().regex(/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/), port: z.number().int().min(1).max(65535) }).strict();
export type GateTunnel = z.infer<typeof GateTunnelSchema>;
export const GatePolicySchema = z
  .object({ version: z.literal(1), run_id: RunId, phase: GatePhase, routes: z.array(GateRouteSchema), tunnels: z.array(GateTunnelSchema).max(8).optional() })
  .strict();
export type GatePolicy = z.infer<typeof GatePolicySchema>;

export const GateLogLine = z
  .object({
    ts: z.string().datetime(),
    run_id: RunId,
    kind: z.enum(["allow", "proxy_block", "dns_block", "policy_loaded", "tunnel"]),
    method: z.string().optional(),
    path: z.string().max(200).optional(),
    qname: z.string().max(253).optional(),
    qtype: z.number().int().optional(),
    phase: GatePhase.optional(),
    status: z.number().int().optional(),
    bytes: z.number().int().optional(),
  })
  .strict();
export type GateLogLine = z.infer<typeof GateLogLine>;
