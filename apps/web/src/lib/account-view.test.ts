import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { ACCOUNT_ERRORS, accountView, POLL_MS } from "./account-view";

describe("account view (D-498)", () => {
  it("without an account the panel says everything still works on this computer", () => {
    expect(accountView({ state: "off" })).toEqual({ show: "off", title: "account.title", note: "account.offNote" });
    expect(accountView({ state: "unconfigured" }).show).toBe("unconfigured");
    expect(en["account.offNote"]).toMatch(/optional/i);
  });

  it("while the browser is open it polls; once in, it asks for the passphrase only if the vault is locked", () => {
    expect(accountView({ state: "pending", userCode: "ABCD-EFGH", verificationUrl: "https://sync.example.org/account/device", expiresAt: "2026-11-04T10:10:00.000Z" })).toMatchObject({ show: "pending", pollMs: POLL_MS });
    const base = { state: "signed_in" as const, email: "a@b.c", server: "https://sync.example.org", lastSync: null };
    expect(accountView({ ...base, vault: "locked" })).toMatchObject({ needsVault: true, note: "account.vaultNote" });
    expect(accountView({ ...base, vault: "open" })).toMatchObject({ needsVault: false, note: "account.syncNote" });
  });

  it("every error code maps to a catalog key", () => {
    for (const k of Object.values(ACCOUNT_ERRORS)) expect(en[k], k).toBeTruthy();
  });
});
