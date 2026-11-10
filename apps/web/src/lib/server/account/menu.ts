import "server-only";
import { db } from "../db";
import { pgLinkStore } from "./local-store";

// D-498: for the menu and Settings — is this computer signed in? Kept apart from wiring.ts so a page does not load
// the sync server's code. Any failure reads as "off" (the menu never breaks a page).
export async function accountMenu(): Promise<"off" | "signed_in"> {
  try {
    const l = await pgLinkStore(db()).get();
    return l?.state === "signed_in" ? "signed_in" : "off";
  } catch {
    return "off";
  }
}
