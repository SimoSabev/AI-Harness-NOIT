import type { GatePolicy, GateRoute } from "@mandat/contract";

export type GateDecision =
  | { allow: true; route: GateRoute }
  | { allow: false; reason: "connect" | "no_route" | "bad_path" | "phase_closed" };

/**
 * D-100 order: CONNECT → connect; phase closed → phase_closed; strip the query; EXACT (method, path) → allow;
 * "..", "//", "%2e", "%2f" (any case) → bad_path; prefix → allow; otherwise no_route. No normalization.
 */
/** D-294: CONNECT only to an exact host:port of `tunnels`, only while the agent runs. */
export function matchTunnel(p: GatePolicy, authority: string): { allow: true; host: string; port: number } | { allow: false } {
  if (p.phase !== "agent") return { allow: false };
  const m = /^([A-Za-z0-9.-]+):(\d{1,5})$/.exec(authority);
  if (!m) return { allow: false };
  const host = (m[1] ?? "").toLowerCase();
  const port = Number(m[2]);
  return (p.tunnels ?? []).some((t) => t.host === host && t.port === port) ? { allow: true, host, port } : { allow: false };
}

export function matchPolicy(p: GatePolicy, method: string, rawPath: string): GateDecision {
  if (method.toUpperCase() === "CONNECT") return { allow: false, reason: "connect" };
  if (p.phase === "closed") return { allow: false, reason: "phase_closed" };
  const q = rawPath.indexOf("?");
  const pathOnly = q >= 0 ? rawPath.slice(0, q) : rawPath;
  const exact = p.routes.find((r) => r.match.kind === "exact" && r.method === method && r.match.path === pathOnly);
  if (exact) return { allow: true, route: exact };
  if (/\.\.|\/\/|%2e|%2f/i.test(pathOnly)) return { allow: false, reason: "bad_path" };
  const prefix = p.routes.find((r) => r.match.kind === "prefix" && r.method === method && pathOnly.startsWith(r.match.path));
  if (prefix) return { allow: true, route: prefix };
  return { allow: false, reason: "no_route" };
}
