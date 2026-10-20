import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { verifyTotp } from "./totp";
import { asService } from "./sql";
import type { Db } from "./sql";

// D-285: the local demo login (MANDAT_DEMO_DEV_AUTH=1) — email + password checked against auth.users.encrypted_password
// (bcrypt, the same rows GoTrue uses) and an HMAC-signed session cookie. Without the flag the web uses Supabase Auth.
export const SESSION_COOKIE = "mandat_session";
export const SESSION_TTL_S = 8 * 3600;

/**
 * MANDAT_WEB_SESSION_SECRET (≥ 32 chars) or a per-process random one (sessions end on restart). The random one lives
 * on globalThis: Next bundles Route Handlers and pages separately, so a module variable would differ between them.
 */
const SLOT = Symbol.for("mandat.web.sessionSecret");
export function sessionSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env.MANDAT_WEB_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  const g = globalThis as { [SLOT]?: string };
  g[SLOT] ??= randomBytes(32).toString("base64url");
  return g[SLOT];
}

const mac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signSession(uid: string, secret: string, nowS: number = Math.floor(Date.now() / 1000)): string {
  const body = Buffer.from(JSON.stringify({ uid, exp: nowS + SESSION_TTL_S })).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

export function readSession(cookie: string | null | undefined, secret: string, nowS: number = Math.floor(Date.now() / 1000)): string | null {
  if (!cookie) return null;
  const [body, sig, extra] = cookie.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { uid?: unknown; exp?: unknown };
    if (typeof v.uid !== "string" || typeof v.exp !== "number" || v.exp < nowS) return null;
    return /^[0-9a-f-]{36}$/.test(v.uid) ? v.uid : null;
  } catch {
    return null;
  }
}

export async function devLogin(db: Db, email: string, password: string): Promise<string | null> {
  if (email.length > 200 || password.length > 200 || password.length === 0) return null;
  const r = await asService(db, (sql) => sql.query<{ id: string | null }>("select private.dev_login($1, $2)::text as id", [email, password]));
  return r.rows[0]?.id ?? null;
}

/** The dev second factor: a fresh TOTP code checked at the moment of the approval (spec S08). */
export function devSecondFactor(db: Db, now: () => number = Date.now) {
  return async (o: { uid: string; code: string }): Promise<Date | null> => {
    const r = await asService(db, (sql) => sql.query<{ secret: string | null }>("select private.dev_totp_secret($1::uuid) as secret", [o.uid]));
    const secret = r.rows[0]?.secret;
    return secret && verifyTotp(secret, o.code, now()) ? new Date(now()) : null;
  };
}
