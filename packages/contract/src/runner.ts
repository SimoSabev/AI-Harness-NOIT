import { z } from "zod";

// E10 hosted (v5 т. 6.1, D-701): the runner protocol `/api/runner/*`. A runner is a machine with Docker that a team
// registers once (a one-time `mrr_` token from an owner), then proves itself with its `mrs_` secret for a short-lived
// JWT, and drains the outbox effects that need Docker on its side. It never holds a database URL, a service key or an
// API key (AGENTS.md rule 2): the effects' results come back through these routes only.

/** outbox kinds a runner may claim: effects that run Docker on the runner's machine; GitHub effects stay on the hosted worker */
export const RUNNER_KINDS = ["baseline", "mcp_vet", "harness_scan"] as const;
export const RunnerKind = z.enum(RUNNER_KINDS);
export type RunnerKind = z.infer<typeof RunnerKind>;

export const RunnerRegistrationToken = z.string().regex(/^mrr_[0-9a-f]{64}$/);
export const RunnerSecret = z.string().regex(/^mrs_[0-9a-f]{64}$/);
export const RunnerId = z.string().uuid();
export const RunnerName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/);

export const RunnerRegisterBody = z.object({ token: RunnerRegistrationToken, name: RunnerName, kinds: z.array(RunnerKind).max(RUNNER_KINDS.length) }).strict();
export type RunnerRegisterBody = z.infer<typeof RunnerRegisterBody>;
export const RunnerRegisterReply = z.object({ runner_id: RunnerId, secret: RunnerSecret, org_id: z.string().uuid() }).strict();
export type RunnerRegisterReply = z.infer<typeof RunnerRegisterReply>;

export const RunnerTokenBody = z.object({ runner_id: RunnerId, secret: RunnerSecret }).strict();
export type RunnerTokenBody = z.infer<typeof RunnerTokenBody>;
export const RunnerTokenReply = z.object({ token: z.string().min(5).max(2048), expires_at: z.string().datetime() }).strict();
export type RunnerTokenReply = z.infer<typeof RunnerTokenReply>;

/** the JWT lives ≤ 15 min; every request also checks that the runner is not revoked (the DB, not the token, decides) */
export const RUNNER_JWT_MAX_SECONDS = 15 * 60;
export const RunnerJwtClaims = z
  .object({
    iss: z.literal("mandat-hosted"),
    aud: z.literal("mandat-runner"),
    sub: RunnerId,
    org: z.string().uuid(),
    kinds: z.array(RunnerKind),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    jti: z.string().regex(/^[0-9a-f]{32}$/),
  })
  .strict()
  .refine((c) => c.exp > c.iat && c.exp - c.iat <= RUNNER_JWT_MAX_SECONDS, { message: "exp must be after iat and at most 15 minutes later" });
export type RunnerJwtClaims = z.infer<typeof RunnerJwtClaims>;

export const RunnerClaimBody = z.object({ limit: z.number().int().min(1).max(20).default(5) }).strict();
export type RunnerClaimBody = z.infer<typeof RunnerClaimBody>;
export const RunnerOutboxRow = z
  .object({ id: z.number().int().positive(), kind: z.string().min(1).max(40), idempotency_key: z.string().min(1).max(300), payload: z.record(z.string(), z.unknown()), attempts: z.number().int().nonnegative(), lease_until: z.string().datetime() })
  .strict();
export type RunnerOutboxRow = z.infer<typeof RunnerOutboxRow>;
export const RunnerClaimReply = z.object({ rows: z.array(RunnerOutboxRow) }).strict();
export type RunnerClaimReply = z.infer<typeof RunnerClaimReply>;
export const RunnerFailBody = z.object({ error: z.string().min(1).max(300) }).strict();
export type RunnerFailBody = z.infer<typeof RunnerFailBody>;
export const RunnerHeartbeatReply = z.object({ runner_id: RunnerId, org_id: z.string().uuid(), kinds: z.array(RunnerKind) }).strict();
export type RunnerHeartbeatReply = z.infer<typeof RunnerHeartbeatReply>;

export type RunnerRoute = { kind: "register" } | { kind: "token" } | { kind: "heartbeat" } | { kind: "claim" } | { kind: "done" | "failed" | "extend"; id: number };

/** The route of a request, or null (= 404). Only POST; the query string is ignored; ids are positive integers. */
export function runnerRoute(method: string, url: string): RunnerRoute | null {
  if (method !== "POST") return null;
  const p = url.split("?")[0] ?? "";
  const fixed: Record<string, RunnerRoute> = { "/api/runner/register": { kind: "register" }, "/api/runner/token": { kind: "token" }, "/api/runner/heartbeat": { kind: "heartbeat" }, "/api/runner/outbox/claim": { kind: "claim" } };
  if (fixed[p]) return fixed[p];
  const m = /^\/api\/runner\/outbox\/([1-9][0-9]{0,14})\/(done|failed|extend)$/.exec(p);
  return m ? { kind: m[2] as "done" | "failed" | "extend", id: Number(m[1]) } : null;
}
