import { z } from "zod";
import { RunId } from "./schemas.js";

// D-032: single source of the gate types; channels and egress-gate import these.
export const GateRouteSchema = z
  .object({
    id: z.string().min(1),
    method: z.enum(["GET", "POST", "HEAD"]),
    match: z.object({ kind: z.enum(["exact", "prefix"]), path: z.string().startsWith("/") }),
    upstream: z.enum(["llm_proxy", "npm_registry", "local_ok"]),
  })
  .strict();
export type GateRoute = z.infer<typeof GateRouteSchema>;

export const GatePhase = z.enum(["install", "agent", "closed"]);
export const GatePolicySchema = z
  .object({ version: z.literal(1), run_id: RunId, phase: GatePhase, routes: z.array(GateRouteSchema) })
  .strict();
export type GatePolicy = z.infer<typeof GatePolicySchema>;

export const GateLogLine = z
  .object({
    ts: z.string().datetime(),
    run_id: RunId,
    kind: z.enum(["allow", "proxy_block", "dns_block", "policy_loaded"]),
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
