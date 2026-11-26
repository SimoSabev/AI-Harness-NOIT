import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { RunnerClaimBody, RunnerFailBody, RunnerRegisterBody, RunnerTokenBody, runnerRoute, sha256Tag } from "@mandat/contract";
import type { RunnerJwtClaims, RunnerKind } from "@mandat/contract";
import type { SqlClient } from "@mandat/ledger";
import { MAX_ATTEMPTS } from "./outbox.js";
import { mintRunnerJwt, verifyRunnerJwt } from "./runner-jwt.js";

// E10 hosted (v5 т. 6.1, D-701/D-702): POST /api/runner/* on the hosted worker. The database work is in the private.runner_*
// functions (supabase/migrations/20261126000700_hosted_runners.sql); here: zod at the edge, the JWT, rate limits.
// Nothing secret is logged or echoed: tokens, secrets and bodies never reach a log line.

export interface RunnerApiDeps {
  /** the hosted worker's own connection (service role / owner): it calls private.runner_* */
  db: SqlClient;
  jwtKey: Buffer;
  now?: () => number;
  /** registrations and token requests per client address and minute (default 10 and 60) */
  registerPerMinute?: number;
  tokenPerMinute?: number;
  log?: (line: string) => void;
}

const MAX_BODY = 64 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > MAX_BODY) throw new HttpError(413, "too_large");
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_json");
  }
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new HttpError(400, "bad_request");
  return r.data;
}

/** a fixed window per key; the map forgets windows older than a minute */
function limiter(perMinute: number, now: () => number): (key: string) => boolean {
  const seen = new Map<string, { start: number; n: number }>();
  return (key) => {
    const t = now();
    for (const [k, v] of seen) if (t - v.start >= 60_000) seen.delete(k);
    const w = seen.get(key) ?? { start: t, n: 0 };
    w.n++;
    seen.set(key, w);
    return w.n <= perMinute;
  };
}

const pgCode = (e: unknown): string | undefined => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined);

/** Returns true when it answered the request (an /api/runner/* path), false to let the next handler try. */
export function runnerApi(d: RunnerApiDeps): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const now = d.now ?? (() => Date.now());
  const regLimit = limiter(d.registerPerMinute ?? 10, now);
  const tokLimit = limiter(d.tokenPerMinute ?? 60, now);
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const authed = async (req: IncomingMessage): Promise<RunnerJwtClaims & { kinds: RunnerKind[] }> => {
    const m = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(String(req.headers.authorization ?? ""));
    const claims = m?.[1] ? verifyRunnerJwt(d.jwtKey, m[1], Math.floor(now() / 1000)) : null;
    if (!claims) throw new HttpError(401, "unauthorized");
    // the DB decides: a revoked (or deleted) runner is refused at once, whatever its token says
    const live = (await d.db.query<{ org_id: string; kinds: RunnerKind[] }>("select org_id::text as org_id, kinds from private.runner_seen($1::uuid)", [claims.sub])).rows[0];
    if (!live || live.org_id !== claims.org) throw new HttpError(401, "unauthorized");
    return { ...claims, kinds: live.kinds };
  };
  return async (req, res) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/runner/")) return false;
    const route = runnerRoute(req.method ?? "", url);
    try {
      if (!route) throw new HttpError(404, "not_found");
      const addr = req.socket.remoteAddress ?? "?";
      if (route.kind === "register") {
        if (!regLimit(addr)) throw new HttpError(429, "rate_limited");
        const b = parse(RunnerRegisterBody, await readJson(req));
        const secret = `mrs_${randomBytes(32).toString("hex")}`;
        try {
          const r = (await d.db.query<{ runner_id: string; org_id: string }>("select runner_id::text as runner_id, org_id::text as org_id from private.runner_register($1, $2::text[], $3)", [sha256Tag(b.token), b.kinds, sha256Tag(secret)])).rows[0];
          if (!r) throw new HttpError(401, "invalid_registration");
          d.log?.(`[runner] registered ${r.runner_id} for org ${r.org_id}`);
          send(res, 201, { runner_id: r.runner_id, secret, org_id: r.org_id });
        } catch (e) {
          if (pgCode(e) === "28000") throw new HttpError(401, "invalid_registration");
          throw e;
        }
        return true;
      }
      if (route.kind === "token") {
        if (!tokLimit(addr)) throw new HttpError(429, "rate_limited");
        const b = parse(RunnerTokenBody, await readJson(req));
        const live = (await d.db.query<{ org_id: string; kinds: RunnerKind[] }>("select org_id::text as org_id, kinds from private.runner_seen($1::uuid, $2)", [b.runner_id, sha256Tag(b.secret)])).rows[0];
        if (!live) throw new HttpError(401, "unauthorized");
        const { token, claims } = mintRunnerJwt(d.jwtKey, { runner: b.runner_id, org: live.org_id, kinds: live.kinds }, Math.floor(now() / 1000));
        send(res, 200, { token, expires_at: new Date(claims.exp * 1000).toISOString() });
        return true;
      }
      const c = await authed(req);
      if (route.kind === "heartbeat") {
        send(res, 200, { runner_id: c.sub, org_id: c.org, kinds: c.kinds });
        return true;
      }
      if (route.kind === "claim") {
        const b = parse(RunnerClaimBody, await readJson(req));
        const rows = (await d.db.query<{ id: string | number; kind: string; idempotency_key: string; payload: Record<string, unknown>; attempts: number; lease_until: Date | string }>("select * from private.runner_outbox_claim($1::uuid, $2, 60)", [c.sub, b.limit])).rows;
        send(res, 200, { rows: rows.map((r) => ({ id: Number(r.id), kind: r.kind, idempotency_key: r.idempotency_key, payload: r.payload, attempts: r.attempts, lease_until: new Date(r.lease_until).toISOString() })) });
        return true;
      }
      if (route.kind === "extend") {
        const r = (await d.db.query<{ u: Date | string | null }>("select private.runner_outbox_extend($1::uuid, $2, 60) as u", [c.sub, route.id])).rows[0];
        if (!r?.u) throw new HttpError(409, "lease_lost");
        send(res, 200, { lease_until: new Date(r.u).toISOString() });
        return true;
      }
      const error = route.kind === "failed" ? parse(RunnerFailBody, await readJson(req)).error : null;
      const ok = (await d.db.query<{ ok: boolean }>("select private.runner_outbox_finish($1::uuid, $2, $3, $4, $5) as ok", [c.sub, route.id, route.kind === "done", error, MAX_ATTEMPTS])).rows[0]?.ok === true;
      if (!ok) throw new HttpError(409, "lease_lost");
      send(res, 200, { ok: true });
      return true;
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.code });
      else {
        d.log?.(`[runner] ${route?.kind ?? "?"}: internal error`);
        send(res, 500, { error: "internal" });
      }
      return true;
    }
  };
}
