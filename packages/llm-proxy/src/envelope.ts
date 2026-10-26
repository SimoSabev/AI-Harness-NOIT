import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

// E7в / D-313: API keys at rest are sealed with AES-256-GCM under a key-encryption key (KEK). The provider name is the
// associated data, so a sealed Anthropic key cannot be replayed as an OpenAI key. Nothing here logs a key.
export type KeyProvider = "anthropic" | "openai" | `mcp:${string}` | `research:${string}` | `conn:${string}`;
export interface SealedKey {
  ciphertext: string; // base64: ciphertext + 16-byte tag
  nonce: string; // base64, 12 bytes, fresh per seal
  kek_id: string;
}

export function kekId(kek: Buffer): string {
  return createHash("sha256").update(kek).digest("hex").slice(0, 16);
}

export function sealKey(value: string, kek: Buffer, provider: KeyProvider): SealedKey {
  if (kek.length !== 32) throw new Error("KEK must be 32 bytes");
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kek, nonce);
  c.setAAD(Buffer.from(provider));
  const body = Buffer.concat([c.update(value, "utf8"), c.final(), c.getAuthTag()]);
  return { ciphertext: body.toString("base64"), nonce: nonce.toString("base64"), kek_id: kekId(kek) };
}

/** Throws on a wrong KEK, a wrong provider or any tampering (GCM tag). */
export function openKey(s: SealedKey, kek: Buffer, provider: KeyProvider): string {
  const body = Buffer.from(s.ciphertext, "base64");
  if (body.length < 17) throw new Error("sealed key too short");
  const d = createDecipheriv("aes-256-gcm", kek, Buffer.from(s.nonce, "base64"));
  d.setAAD(Buffer.from(provider));
  d.setAuthTag(body.subarray(body.length - 16));
  return Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]).toString("utf8");
}

/**
 * The KEK: env MANDAT_KEK (base64 of 32 bytes; a VPS, or the desktop app that keeps it in Electron safeStorage) wins;
 * otherwise $MANDAT_HOME/kek (0600), created once (`pnpm local`).
 */
export function loadKek(o: { env: Record<string, string | undefined>; mandatHome: string }): Buffer {
  const fromEnv = o.env.MANDAT_KEK;
  if (fromEnv !== undefined && fromEnv !== "") {
    const k = Buffer.from(fromEnv, "base64");
    if (k.length !== 32) throw new Error("MANDAT_KEK must be base64 of 32 bytes");
    return k;
  }
  const file = path.join(o.mandatHome, "kek");
  if (!existsSync(file)) {
    mkdirSync(o.mandatHome, { recursive: true });
    writeFileSync(file, randomBytes(32), { mode: 0o600, flag: "wx" });
  }
  chmodSync(file, 0o600);
  const k = readFileSync(file);
  if (k.length !== 32) throw new Error(`${file} is not a 32-byte key`);
  return k;
}

/** Local key store: $MANDAT_HOME/keys.sealed.json (0600), one sealed entry per provider. */
export class FileKeyStore {
  private readonly file: string;
  constructor(
    private readonly mandatHome: string,
    private readonly kek: Buffer,
  ) {
    this.file = path.join(mandatHome, "keys.sealed.json");
  }
  private read(): Record<string, SealedKey> {
    try {
      const v: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, SealedKey>) : {};
    } catch {
      return {};
    }
  }
  private write(all: Record<string, SealedKey>): void {
    mkdirSync(this.mandatHome, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.file);
  }
  put(provider: KeyProvider, value: string): void {
    this.write({ ...this.read(), [provider]: sealKey(value, this.kek, provider) });
  }
  /** null when missing or unreadable with this KEK (never a garbled key). */
  get(provider: KeyProvider): string | null {
    const s = this.read()[provider];
    if (!s) return null;
    try {
      return openKey(s, this.kek, provider);
    } catch {
      return null;
    }
  }
  delete(provider: KeyProvider): void {
    const all = this.read();
    delete all[provider];
    this.write(all);
  }
  providers(): string[] {
    return Object.keys(this.read()).sort();
  }
}
