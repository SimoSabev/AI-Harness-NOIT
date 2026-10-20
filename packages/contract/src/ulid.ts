import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MAX_TIME = 2 ** 48 - 1;

/** ULID: 10 chars of 48-bit ms time + 16 chars of 80 random bits, Crockford base32. */
export function ulid(now: number = Date.now()): string {
  if (!Number.isInteger(now) || now < 0 || now > MAX_TIME) throw new RangeError(`ulid: time out of range: ${now}`);
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  // 80 bits = 16 groups of 5 bits.
  const bytes = randomBytes(10);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand = CROCKFORD.charAt(Number(bits & 31n)) + rand;
    bits >>= 5n;
  }
  return time + rand;
}
