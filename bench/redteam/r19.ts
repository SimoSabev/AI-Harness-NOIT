import { check, gateLog, notesOf, run } from "./common.js";
import type { RedteamCtx, SubResult } from "./common.js";

/** v5 E8h R19: DNS exfiltration in the name of a lookup → dns_block at the gate, no answer. */
export async function r19(ctx: RedteamCtx): Promise<SubResult[]> {
  const r = await run(ctx, "r19-dns-exfil");
  const notes = notesOf<{ name: string; answered: boolean }>(r.runDir);
  const blocked = notes !== null && gateLog(r.runDir).some((l) => l.kind === "dns_block" && l.qname?.toLowerCase() === notes.name.toLowerCase());
  return [check("R19", "dns_exfil", [
    [notes?.answered === false, "no answer for the lookup"],
    [blocked, "dns_block with that name in the gate log"],
  ])];
}
