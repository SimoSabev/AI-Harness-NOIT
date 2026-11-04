import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { MandatError, type SealedSecret, type WrappedVaultKey } from "@mandat/contract";

// D-493: API keys follow the person to another device only sealed. A random 32-byte vault key is made on the device;
// every key is sealed with it (AES-256-GCM, aad = "<kind>/<id>"). The vault key itself goes to the server only wrapped
// by the person's sync passphrase (scrypt). The server holds ciphertext and a wrapped key, never the passphrase and
// never a key in clear; a new device asks for the passphrase once.

export interface ScryptCost { n: number; r: number; p: number }
export const DEFAULT_COST: ScryptCost = { n: 1 << 15, r: 8, p: 1 };
export const MIN_PASSPHRASE = 10;

const b64 = (b: Buffer): string => b.toString("base64url");
const unb64 = (s: string): Buffer => Buffer.from(s, "base64url");
const kidOf = (key: Buffer): string => createHash("sha256").update(key).digest("hex").slice(0, 16);

function derive(passphrase: string, salt: Buffer, c: ScryptCost): Buffer {
  return scryptSync(passphrase.normalize("NFC"), salt, 32, { N: c.n, r: c.r, p: c.p, maxmem: 256 * c.n * c.r + 1024 * 1024 });
}

function gcmSeal(key: Buffer, plain: Buffer, aad: string): { iv: string; ct: string; tag: string } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return { iv: b64(iv), ct: b64(ct), tag: b64(c.getAuthTag()) };
}

function gcmOpen(key: Buffer, box: { iv: string; ct: string; tag: string }, aad: string, what: string): Buffer {
  try {
    const d = createDecipheriv("aes-256-gcm", key, unb64(box.iv));
    d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(unb64(box.tag));
    return Buffer.concat([d.update(unb64(box.ct)), d.final()]);
  } catch {
    throw new MandatError("E_SYNC_VAULT", `${what} did not open`);
  }
}

export function createVault(passphrase: string, cost: ScryptCost = DEFAULT_COST): { key: Buffer; wrapped: WrappedVaultKey } {
  if (passphrase.length < MIN_PASSPHRASE) throw new MandatError("E_SYNC_VAULT", `the sync passphrase needs at least ${MIN_PASSPHRASE} characters`);
  const key = randomBytes(32);
  const salt = randomBytes(16);
  const kid = kidOf(key);
  const box = gcmSeal(derive(passphrase, salt, cost), key, `vault/${kid}`);
  return { key, wrapped: { v: 1, kdf: "scrypt", n: cost.n, r: cost.r, p: cost.p, salt: b64(salt), kid, ...box } };
}

export function openVault(passphrase: string, w: WrappedVaultKey): Buffer {
  const key = gcmOpen(derive(passphrase, unb64(w.salt), w), w, `vault/${w.kid}`, "the vault (wrong passphrase?)");
  if (kidOf(key) !== w.kid) throw new MandatError("E_SYNC_VAULT", "the vault did not open");
  return key;
}

export function seal(key: Buffer, plaintext: string, aad: string): SealedSecret {
  return { v: 1, alg: "A256GCM", kid: kidOf(key), ...gcmSeal(key, Buffer.from(plaintext, "utf8"), aad) };
}

export function unseal(key: Buffer, s: SealedSecret, aad: string): string {
  if (s.kid !== kidOf(key)) throw new MandatError("E_SYNC_VAULT", "sealed under another vault");
  return gcmOpen(key, s, aad, "the sealed value").toString("utf8");
}
