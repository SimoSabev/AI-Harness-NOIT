import { describe, expect, it } from "vitest";
import { MandatError } from "@mandat/contract";
import { createVault, openVault, seal, unseal } from "./vault.js";

const FAST = { n: 1024, r: 8, p: 1 }; // the test cost; real vaults use the default (2^15)
const KEY = "sk-ant-api03-TESTONLY-not-a-real-key-0000000000000000";

describe("vault (D-493): keys are sealed on the device", () => {
  it("seals and opens a value with the vault key", () => {
    const v = createVault("correct horse battery staple", FAST);
    const s = seal(v.key, KEY, "secret/anthropic");
    expect(JSON.stringify(s)).not.toContain("sk-ant");
    expect(unseal(v.key, s, "secret/anthropic")).toBe(KEY);
  });

  it("the passphrase opens the wrapped key on another device; a wrong one does not", () => {
    const v = createVault("correct horse battery staple", FAST);
    const again = openVault("correct horse battery staple", v.wrapped);
    expect(again.equals(v.key)).toBe(true);
    expect(() => openVault("wrong", v.wrapped)).toThrow(MandatError);
  });

  it("a sealed value cannot be moved to another record (aad) or tampered with", () => {
    const v = createVault("pw-pw-pw-pw", FAST);
    const s = seal(v.key, KEY, "secret/a");
    expect(() => unseal(v.key, s, "secret/b")).toThrow(MandatError);
    expect(() => unseal(v.key, { ...s, ct: s.ct.slice(0, -2) + (s.ct.endsWith("AA") ? "BB" : "AA") }, "secret/a")).toThrow(MandatError);
  });

  it("a value sealed under one vault does not open under another", () => {
    const a = createVault("one-one-one", FAST);
    const b = createVault("two-two-two", FAST);
    expect(() => unseal(b.key, seal(a.key, KEY, "secret/x"), "secret/x")).toThrow(MandatError);
  });

  it("refuses a short passphrase", () => {
    expect(() => createVault("short", FAST)).toThrow(MandatError);
  });
});
