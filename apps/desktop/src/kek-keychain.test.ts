import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileKeyStore, loadKek } from "../../../packages/llm-proxy/src/envelope.js";
import { KEYCHAIN_KEK_FILE, harnessEnv, keychainUsable, resolveDesktopKek } from "./kek-keychain.js";
import type { KeychainLike } from "./kek-keychain.js";

// E9g A4 (AC-12.9, D-374): the KEK of the key envelope (D-313/D-345) lives in the OS keychain through Electron
// safeStorage. These tests use a fake keychain: a secret only it knows, XOR-ed in, so a "restart" with the same
// keychain opens the KEK and a different keychain cannot.
const dirs: string[] = [];
const tmp = () => {
  const d = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-kek-")));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fakeKeychain(o: { available?: boolean; backend?: string; secret?: Buffer; reEncrypt?: boolean } = {}): KeychainLike & { calls: { enc: number; dec: number } } {
  const secret = o.secret ?? randomBytes(32);
  const xor = (b: Buffer) => Buffer.from(b.map((x, i) => x ^ (secret[i % secret.length] ?? 0)));
  const calls = { enc: 0, dec: 0 };
  return {
    calls,
    isAsyncEncryptionAvailable: () => Promise.resolve(o.available ?? true),
    encryptStringAsync: (s: string) => {
      calls.enc += 1;
      return Promise.resolve(Buffer.concat([Buffer.from("FK1"), xor(Buffer.from(s, "utf8"))]));
    },
    decryptStringAsync: (b: Buffer) => {
      calls.dec += 1;
      if (b.subarray(0, 3).toString() !== "FK1") return Promise.reject(new Error("not ours"));
      return Promise.resolve({ shouldReEncrypt: o.reEncrypt ?? false, result: xor(b.subarray(3)).toString("utf8") });
    },
    getSelectedStorageBackend: () => o.backend ?? "gnome_libsecret",
  };
}

describe("the KEK in the OS keychain (AC-12.9, D-374)", () => {
  it("first start: a fresh 32-byte KEK, sealed by the keychain into MANDAT_HOME/kek.keychain (0600); no plaintext kek file", async () => {
    const home = path.join(tmp(), ".mandat");
    const kc = fakeKeychain();
    const r = await resolveDesktopKek({ keychain: kc, platform: "darwin", mandatHome: home });
    expect(r.source).toBe("keychain");
    if (r.source !== "keychain") return;
    expect(r.kek.length).toBe(32);
    const file = path.join(home, KEYCHAIN_KEK_FILE);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file).includes(r.kek)).toBe(false);
    expect(readFileSync(file, "utf8")).not.toContain(r.kek.toString("base64"));
    expect(existsSync(path.join(home, "kek"))).toBe(false);
    expect(readdirSync(home).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("keys survive a restart: sealed under the keychain KEK, opened again after a new start with the same keychain", async () => {
    const home = path.join(tmp(), ".mandat");
    const secret = randomBytes(32);
    const first = await resolveDesktopKek({ keychain: fakeKeychain({ secret }), platform: "darwin", mandatHome: home });
    if (first.source !== "keychain") throw new Error("expected keychain");
    // the harness child gets the KEK through env, as loadKek reads it (packages/llm-proxy)
    const kek1 = loadKek({ env: harnessEnv({ PATH: "/bin" }, first.kek), mandatHome: home });
    new FileKeyStore(home, kek1).put("anthropic", "sk-ant-test-value");
    // restart: a new process, the same keychain, the same profile
    const second = await resolveDesktopKek({ keychain: fakeKeychain({ secret }), platform: "darwin", mandatHome: home });
    if (second.source !== "keychain") throw new Error("expected keychain");
    expect(second.kek.equals(first.kek)).toBe(true);
    const kek2 = loadKek({ env: harnessEnv({}, second.kek), mandatHome: home });
    expect(new FileKeyStore(home, kek2).get("anthropic")).toBe("sk-ant-test-value");
    expect(existsSync(path.join(home, "kek"))).toBe(false);
  });

  it("an existing plaintext kek file (from `pnpm local`) is adopted, so keys sealed before stay readable; the file is kept (Q-062)", async () => {
    const home = path.join(tmp(), ".mandat");
    mkdirSync(home, { recursive: true });
    const old = randomBytes(32);
    writeFileSync(path.join(home, "kek"), old, { mode: 0o600 });
    new FileKeyStore(home, old).put("openai", "sk-old");
    const r = await resolveDesktopKek({ keychain: fakeKeychain(), platform: "win32", mandatHome: home });
    if (r.source !== "keychain") throw new Error("expected keychain");
    expect(r.kek.equals(old)).toBe(true);
    expect(new FileKeyStore(home, r.kek).get("openai")).toBe("sk-old");
    expect(readFileSync(path.join(home, "kek")).equals(old)).toBe(true);
  });

  it("no usable keychain (not available, Linux basic_text or unknown) → source file: the env is untouched, loadKek keeps the 0600 file", async () => {
    for (const [kc, platform] of [
      [fakeKeychain({ available: false }), "darwin"],
      [fakeKeychain({ backend: "basic_text" }), "linux"],
      [fakeKeychain({ backend: "unknown" }), "linux"],
    ] as const) {
      const home = path.join(tmp(), ".mandat");
      expect(await keychainUsable(kc, platform)).toBe(false);
      const r = await resolveDesktopKek({ keychain: kc, platform, mandatHome: home });
      expect(r).toEqual({ source: "file", reason: "keychain_unavailable" });
      expect(existsSync(path.join(home, KEYCHAIN_KEK_FILE))).toBe(false);
      expect(kc.calls.enc).toBe(0);
    }
    expect(await keychainUsable(fakeKeychain({ backend: "basic_text" }), "darwin")).toBe(true); // the backend name is Linux-only
    expect(await keychainUsable(fakeKeychain({ backend: "kwallet6" }), "linux")).toBe(true);
    // getSelectedStorageBackend is Linux-only and undefined at runtime elsewhere (smoke, Electron 44.9.0 on macOS)
    const { getSelectedStorageBackend: _drop, ...noBackend } = fakeKeychain();
    expect(await keychainUsable(noBackend, "darwin")).toBe(true);
    expect(await keychainUsable(noBackend, "linux")).toBe(false);
    expect(await keychainUsable({ ...noBackend, isAsyncEncryptionAvailable: () => Promise.reject(new Error("x")) }, "win32")).toBe(false);
  });

  it("a sealed KEK the keychain cannot open (another keychain, a denied prompt) is never replaced by a new one", async () => {
    const home = path.join(tmp(), ".mandat");
    await resolveDesktopKek({ keychain: fakeKeychain(), platform: "darwin", mandatHome: home });
    const sealed = readFileSync(path.join(home, KEYCHAIN_KEK_FILE));
    const r = await resolveDesktopKek({ keychain: fakeKeychain(), platform: "darwin", mandatHome: home });
    expect(r).toEqual({ source: "file", reason: "keychain_locked" });
    expect(readFileSync(path.join(home, KEYCHAIN_KEK_FILE)).equals(sealed)).toBe(true);
  });

  it("a sealed value that is not a 32-byte key → keychain_locked, file kept", async () => {
    const home = path.join(tmp(), ".mandat");
    const secret = randomBytes(32);
    const kc = fakeKeychain({ secret });
    mkdirSync(home, { recursive: true });
    writeFileSync(path.join(home, KEYCHAIN_KEK_FILE), await kc.encryptStringAsync(Buffer.alloc(8).toString("base64")), { mode: 0o600 });
    expect(await resolveDesktopKek({ keychain: fakeKeychain({ secret }), platform: "darwin", mandatHome: home })).toEqual({ source: "file", reason: "keychain_locked" });
  });

  it("shouldReEncrypt (a rotated keychain key) → the same KEK is sealed again", async () => {
    const home = path.join(tmp(), ".mandat");
    const secret = randomBytes(32);
    const a = await resolveDesktopKek({ keychain: fakeKeychain({ secret }), platform: "darwin", mandatHome: home });
    const kc = fakeKeychain({ secret, reEncrypt: true });
    const b = await resolveDesktopKek({ keychain: kc, platform: "darwin", mandatHome: home });
    if (a.source !== "keychain" || b.source !== "keychain") throw new Error("expected keychain");
    expect(b.kek.equals(a.kek)).toBe(true);
    expect(kc.calls.enc).toBe(1);
    expect(statSync(path.join(home, KEYCHAIN_KEK_FILE)).mode & 0o777).toBe(0o600);
  });

  it("harnessEnv: the keychain KEK wins over an inherited MANDAT_KEK; without one the inherited value stays; API keys never pass", () => {
    const kek = randomBytes(32);
    expect(harnessEnv({ PATH: "/bin", MANDAT_KEK: "old", ANTHROPIC_API_KEY: "x", ELECTRON_RUN_AS_NODE: "1" }, kek)).toEqual({ PATH: "/bin", MANDAT_KEK: kek.toString("base64") });
    expect(harnessEnv({ PATH: "/bin", MANDAT_KEK: "inherited" }, null)).toEqual({ PATH: "/bin", MANDAT_KEK: "inherited" });
    expect(harnessEnv({ PATH: "/bin" }, null)).toEqual({ PATH: "/bin" });
  });
});
