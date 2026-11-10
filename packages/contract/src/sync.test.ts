import { describe, expect, it } from "vitest";
import { AccountStatus, SealedSecret, SyncChange, SyncRecord, WrappedVaultKey } from "./sync.js";

describe("sync contract (D-490)", () => {
  it("a record carries a kind, an id, a server revision and a JSON body", () => {
    const r = { kind: "prefs", id: "ui", rev: 3, updatedAt: "2026-11-04T10:00:00.000Z", deleted: false, body: { lang: "bg" } };
    expect(SyncRecord.parse(r)).toEqual(r);
    expect(SyncRecord.safeParse({ ...r, kind: "password" }).success).toBe(false);
    expect(SyncRecord.safeParse({ ...r, id: "../etc" }).success).toBe(false);
    expect(SyncRecord.safeParse({ ...r, extra: 1 }).success).toBe(false);
  });

  it("a sealed secret is only an envelope: no field can carry a plaintext key", () => {
    const s = { v: 1, alg: "A256GCM", kid: "0123456789abcdef", iv: "aaaa", ct: "bbbb", tag: "cccc" };
    expect(SealedSecret.parse(s)).toEqual(s);
    expect(SealedSecret.safeParse({ ...s, key: "sk-ant-x" }).success).toBe(false);
    expect(SealedSecret.safeParse({ ...s, ct: "sk-ant api03 with spaces" }).success).toBe(false);
  });

  it("the wrapped vault key bounds the scrypt cost", () => {
    const w = { v: 1, kdf: "scrypt", n: 32768, r: 8, p: 1, salt: "s", kid: "0123456789abcdef", iv: "i", ct: "c", tag: "t" };
    expect(WrappedVaultKey.parse(w)).toEqual(w);
    expect(WrappedVaultKey.safeParse({ ...w, n: 1 << 30 }).success).toBe(false);
  });

  it("a change names the revision it was based on; the account status never carries a token", () => {
    expect(SyncChange.parse({ kind: "task", id: "t1", baseRev: 0, deleted: false, body: {} }).baseRev).toBe(0);
    const s = AccountStatus.parse({ state: "signed_in", email: "a@b.c", server: "https://sync.example", lastSync: null, vault: "none", token: "x" });
    expect(s).not.toHaveProperty("token");
  });
});
