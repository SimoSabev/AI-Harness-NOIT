import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { RUNNER_JWT_MAX_SECONDS, RunnerJwtClaims } from "@mandat/contract";
import type { RunnerKind } from "@mandat/contract";

// E10 hosted (v5 т. 6.1, D-701): the runner's short JWT. HS256 over node:crypto (no new dependency); the header is one
// fixed string, so there is no `alg` to choose (no "none", no key confusion). The DB still decides on every request
// whether the runner is revoked; the token only saves a secret check per request.

const HEADER = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
const SKEW_SECONDS = 60;

const sign = (key: Buffer, data: string): Buffer => createHmac("sha256", key).update(data).digest();

export function mintRunnerJwt(key: Buffer, r: { runner: string; org: string; kinds: readonly RunnerKind[] }, nowSec: number): { token: string; claims: RunnerJwtClaims } {
  const claims = RunnerJwtClaims.parse({ iss: "mandat-hosted", aud: "mandat-runner", sub: r.runner, org: r.org, kinds: [...r.kinds], iat: nowSec, exp: nowSec + RUNNER_JWT_MAX_SECONDS, jti: randomBytes(16).toString("hex") });
  const body = `${HEADER}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return { token: `${body}.${sign(key, body).toString("base64url")}`, claims };
}

export function verifyRunnerJwt(key: Buffer, token: string, nowSec: number): RunnerJwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  if (h !== HEADER) return null;
  const want = sign(key, `${h}.${p}`);
  const got = Buffer.from(s, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const c = RunnerJwtClaims.safeParse(raw);
  if (!c.success) return null;
  if (c.data.exp <= nowSec || c.data.iat > nowSec + SKEW_SECONDS) return null;
  return c.data;
}

/** MANDAT_RUNNER_JWT_SECRET (≥ 32 characters) or MANDAT_RUNNER_JWT_SECRET_FILE; null = the runner routes are off */
export function runnerJwtSecret(env: Record<string, string | undefined>, readFile: (path: string) => string): Buffer | null {
  const v = env.MANDAT_RUNNER_JWT_SECRET ?? (env.MANDAT_RUNNER_JWT_SECRET_FILE ? readFile(env.MANDAT_RUNNER_JWT_SECRET_FILE).trim() : "");
  return v.length >= 32 ? Buffer.from(v) : null;
}
