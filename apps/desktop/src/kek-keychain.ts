import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { childEnv } from "./banner.js";

// E9g A4 (AC-12.9, D-374): the key-encryption key (KEK) of the key envelope (D-313, D-345) kept by the OS keychain
// through Electron safeStorage (macOS Keychain, Windows DPAPI, Linux Secret Service / kwallet). Only the sealed bytes
// are on disk (MANDAT_HOME/kek.keychain, 0600); the KEK itself reaches the harness child (`pnpm local`) as env
// MANDAT_KEK, which loadKek in packages/llm-proxy already reads. Never logged; never given to `mandat apply` or the
// sandbox (childEnv drops it; docker gets only its own keys, D-084).
//
// Fail safe: no usable keychain → the existing 0600 file KEK (source "file"); a sealed KEK that cannot be opened is
// never replaced by a new one (that would make every sealed key unreadable).

export const KEYCHAIN_KEK_FILE = "kek.keychain";
const PLAIN_KEK_FILE = "kek"; // packages/llm-proxy loadKek

/** The part of Electron's safeStorage this module uses (async API, Electron 44; the sync one is deprecated). */
export interface KeychainLike {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{ shouldReEncrypt: boolean; result: string }>;
  getSelectedStorageBackend?(): string;
}

export type DesktopKek = { source: "keychain"; kek: Buffer } | { source: "file"; reason: "keychain_unavailable" | "keychain_locked" };

/** Linux without a secret store encrypts with a hard-coded password (basic_text): that is no keychain. */
export async function keychainUsable(kc: KeychainLike, platform: NodeJS.Platform): Promise<boolean> {
  let ok: boolean;
  try {
    ok = await kc.isAsyncEncryptionAvailable();
  } catch {
    return false;
  }
  if (!ok) return false;
  if (platform === "linux") {
    const b = kc.getSelectedStorageBackend?.() ?? "unknown";
    if (b === "basic_text" || b === "unknown") return false;
  }
  return true;
}

function parseKek(b64: string): Buffer | null {
  const k = Buffer.from(b64, "base64");
  return k.length === 32 && k.toString("base64") === b64 ? k : null;
}

function readIfExists(file: string): Buffer | null {
  try {
    return readFileSync(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function writeAtomic(file: string, body: Buffer): void {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw e;
  }
  closeSync(fd);
  try {
    chmodSync(tmp, 0o600);
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

export async function resolveDesktopKek(o: { keychain: KeychainLike; platform: NodeJS.Platform; mandatHome: string }): Promise<DesktopKek> {
  if (!(await keychainUsable(o.keychain, o.platform))) return { source: "file", reason: "keychain_unavailable" };
  const sealedFile = path.join(o.mandatHome, KEYCHAIN_KEK_FILE);
  const sealed = readIfExists(sealedFile);
  if (sealed !== null) {
    let opened: { shouldReEncrypt: boolean; result: string };
    try {
      opened = await o.keychain.decryptStringAsync(sealed);
    } catch {
      return { source: "file", reason: "keychain_locked" };
    }
    const kek = parseKek(opened.result);
    if (kek === null) return { source: "file", reason: "keychain_locked" };
    if (opened.shouldReEncrypt) writeAtomic(sealedFile, await o.keychain.encryptStringAsync(opened.result));
    return { source: "keychain", kek };
  }
  // First start with a keychain: adopt the KEK `pnpm local` made before (keys sealed under it stay readable), else a new one.
  const plain = readIfExists(path.join(o.mandatHome, PLAIN_KEK_FILE));
  const kek = plain !== null && plain.length === 32 ? plain : randomBytes(32);
  writeAtomic(sealedFile, await o.keychain.encryptStringAsync(kek.toString("base64")));
  return { source: "keychain", kek };
}

/** The env of the harness child: childEnv (no API keys, no inherited KEK) + the keychain KEK, or the inherited one without it. */
export function harnessEnv(env: Record<string, string | undefined>, kek: Buffer | null): Record<string, string> {
  const out = childEnv(env);
  const inherited = env.MANDAT_KEK;
  if (kek !== null) out.MANDAT_KEK = kek.toString("base64");
  else if (inherited !== undefined && inherited !== "") out.MANDAT_KEK = inherited;
  return out;
}
