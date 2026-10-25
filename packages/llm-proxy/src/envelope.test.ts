import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FileKeyStore, kekId, loadKek, openKey, sealKey } from "./index.js";

const KEY = ["sk", "ant", "api03", randomBytes(30).toString("base64url")].join("-"); // D-095: assembled at runtime

describe("key envelope (E7в, D-313)", () => {
  it("round trip; the ciphertext does not contain the key; nonce is unique", () => {
    const kek = randomBytes(32);
    const a = sealKey(KEY, kek, "anthropic");
    const b = sealKey(KEY, kek, "anthropic");
    expect(openKey(a, kek, "anthropic")).toBe(KEY);
    expect(a.nonce).not.toBe(b.nonce);
    expect(Buffer.from(a.ciphertext, "base64").toString("latin1")).not.toContain(KEY.slice(0, 12));
    expect(a.kek_id).toBe(kekId(kek));
  });
  it("a wrong KEK, a swapped provider or a flipped bit → error", () => {
    const kek = randomBytes(32);
    const s = sealKey(KEY, kek, "anthropic");
    expect(() => openKey(s, randomBytes(32), "anthropic")).toThrow();
    expect(() => openKey(s, kek, "openai")).toThrow(); // provider is the AAD
    const c = Buffer.from(s.ciphertext, "base64");
    c[0] = (c[0] ?? 0) ^ 1;
    expect(() => openKey({ ...s, ciphertext: c.toString("base64") }, kek, "anthropic")).toThrow();
  });
  it("KEK: MANDAT_KEK (base64, 32 bytes) wins; else a 0600 file created once under MANDAT_HOME", () => {
    const home = mkdtempSync(path.join(tmpdir(), "kek-"));
    const env = randomBytes(32);
    expect(loadKek({ env: { MANDAT_KEK: env.toString("base64") }, mandatHome: home }).equals(env)).toBe(true);
    expect(() => loadKek({ env: { MANDAT_KEK: "short" }, mandatHome: home })).toThrow();
    const k1 = loadKek({ env: {}, mandatHome: home });
    const k2 = loadKek({ env: {}, mandatHome: home });
    expect(k1.equals(k2)).toBe(true);
    expect(statSync(path.join(home, "kek")).mode & 0o777).toBe(0o600);
  });
  it("file store: keys survive a new store object (a restart); the file holds no key text; 0600", () => {
    const home = mkdtempSync(path.join(tmpdir(), "ks-"));
    const kek = randomBytes(32);
    new FileKeyStore(home, kek).put("anthropic", KEY);
    const again = new FileKeyStore(home, kek);
    expect(again.get("anthropic")).toBe(KEY);
    expect(again.providers()).toEqual(["anthropic"]);
    const file = path.join(home, "keys.sealed.json");
    expect(readFileSync(file, "utf8")).not.toContain(KEY);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    again.delete("anthropic");
    expect(new FileKeyStore(home, kek).get("anthropic")).toBeNull();
  });
  it("file store with another KEK → the key is unreadable (null), never garbage", () => {
    const home = mkdtempSync(path.join(tmpdir(), "ks-"));
    new FileKeyStore(home, randomBytes(32)).put("openai", KEY);
    expect(new FileKeyStore(home, randomBytes(32)).get("openai")).toBeNull();
    writeFileSync(path.join(home, "keys.sealed.json"), "not json");
    expect(new FileKeyStore(home, randomBytes(32)).providers()).toEqual([]);
  });
});
