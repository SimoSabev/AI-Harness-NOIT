import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// D-285: RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for the local demo login (MANDAT_DEMO_DEV_AUTH=1). With Supabase Auth
// the second factor is GoTrue MFA (mfa.challenge + mfa.verify); this module is only the dev substitute.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of s.replace(/=+$/, "")) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("bad base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpAt(secretB32: string, ms: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(ms / 1000 / 30)));
  const h = createHmac("sha1", base32Decode(secretB32)).update(counter).digest();
  const off = (h[h.length - 1] as number) & 15;
  const bin = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString();
  return bin.padStart(6, "0");
}

/** ±1 step; constant-time compare per candidate. */
export function verifyTotp(secretB32: string, code: string, ms: number = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let ok = false;
  for (const d of [-1, 0, 1]) ok = timingSafeEqual(Buffer.from(totpAt(secretB32, ms + d * 30_000)), Buffer.from(code)) || ok;
  return ok;
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function otpauthUri(secretB32: string, account: string): string {
  return `otpauth://totp/Mandat:${encodeURIComponent(account)}?secret=${secretB32}&issuer=Mandat&algorithm=SHA1&digits=6&period=30`;
}
