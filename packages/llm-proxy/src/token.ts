import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TokenClaims {
  t: string; // task_id
  r: string; // run_id
  a: 1;
  e: number; // expiry, unix seconds
  b: number; // budget USD
  n: string; // 16 hex nonce
  /** E3в: the provider of the channel this token is for (absent = anthropic, E0 tokens) */
  p?: "anthropic" | "openai";
  /** D-392: the saved connection (proxy upstream) this token is for; absent = the provider's own key */
  u?: string;
}

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const hmac = (secret: Buffer, data: string): Buffer => createHmac("sha256", secret).update(data).digest();

/** D-009: "mdt_" + b64url(JSON claims) + "." + b64url(HMAC-SHA256(secret, <b64url claims>)). Stateless. */
export function mintTaskToken(secret: Buffer, c: TokenClaims): string {
  const body = b64(JSON.stringify(c));
  return `mdt_${body}.${b64(hmac(secret, body))}`;
}

export function verifyTaskToken(
  secret: Buffer,
  token: string,
  nowS: number,
): { ok: true; claims: TokenClaims } | { ok: false; code: "token_invalid" | "token_expired" } {
  const m = /^mdt_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return { ok: false, code: "token_invalid" };
  const [, body = "", sig = ""] = m;
  const expected = hmac(secret, body);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { ok: false, code: "token_invalid" };
  let c: TokenClaims;
  try {
    c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenClaims;
  } catch {
    return { ok: false, code: "token_invalid" };
  }
  if (typeof c.r !== "string" || typeof c.t !== "string" || typeof c.e !== "number" || typeof c.b !== "number" || c.a !== 1 || (c.p !== undefined && c.p !== "anthropic" && c.p !== "openai") || (c.u !== undefined && (typeof c.u !== "string" || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(c.u)))) {
    return { ok: false, code: "token_invalid" };
  }
  if (c.e < nowS) return { ok: false, code: "token_expired" };
  return { ok: true, claims: c };
}

export function adminBearer(secret: Buffer): string {
  return b64(hmac(secret, "mandat-admin-v1"));
}

/** The only form of a token allowed in logs: 8 hex of sha256. */
export function tokenPrefix8(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}
