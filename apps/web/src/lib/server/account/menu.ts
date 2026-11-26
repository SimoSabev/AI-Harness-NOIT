import "server-only";
import { db } from "../db";
import { accountMenuState, syncUrl } from "./config";
import type { AccountMenu } from "./config";
import { pgLinkStore } from "./local-store";

// D-498: for the menu and Settings — is this computer signed in? Kept apart from wiring.ts so a page does not load
// the sync server's code. Any failure reads as not signed in (the menu never breaks a page).
// D-625: "hidden" when no sync server is set and nothing is signed in — then there is no profile to show.
export async function accountMenu(): Promise<AccountMenu> {
  const signedIn = await pgLinkStore(db()).get().then((l) => l?.state === "signed_in", () => false);
  return accountMenuState(syncUrl(), signedIn);
}
