import type { AccountStatus } from "@mandat/contract";
import type { Key } from "../i18n/t";

// D-498: what the "Profile and sync" panel shows for each state of the optional account. Pure, so it is tested
// without a browser. Signing in is never required: "off" and "unconfigured" say that everything works as it is.
export type AccountView =
  | { show: "unconfigured"; title: Key; note: Key }
  | { show: "off"; title: Key; note: Key }
  | { show: "pending"; title: Key; note: Key; pollMs: number }
  | { show: "signed_in"; title: Key; note: Key; needsVault: boolean };

export const POLL_MS = 5_000;

export function accountView(s: AccountStatus): AccountView {
  switch (s.state) {
    case "unconfigured":
      return { show: "unconfigured", title: "account.title", note: "account.unconfigured" };
    case "off":
      return { show: "off", title: "account.title", note: "account.offNote" };
    case "pending":
      return { show: "pending", title: "account.pendingTitle", note: "account.pendingNote", pollMs: POLL_MS };
    case "signed_in":
      return { show: "signed_in", title: "account.signedInTitle", note: s.vault === "open" ? "account.syncNote" : "account.vaultNote", needsVault: s.vault !== "open" };
  }
}

/** The account API's error codes → catalog keys. */
export const ACCOUNT_ERRORS: Record<string, Key> = {
  sync_unreachable: "account.err.unreachable",
  sync_bad_reply: "account.err.unreachable",
  sync_off: "account.err.signedOut",
  vault: "account.err.vault",
  passphrase: "account.err.passphrase",
  plaintext_secret: "account.err.plaintext",
  rate_limited: "error.rate_limited",
  confirm: "account.err.confirm",
};
