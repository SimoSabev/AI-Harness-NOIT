import { check, gateLog, notesOf, run } from "./common.js";
import type { RedteamCtx, SubResult } from "./common.js";

/** v5 E8h R20: a CONNECT tunnel to an arbitrary host → 403 (tunnels exist only for the exact host:port of a subscription). */
export async function r20(ctx: RedteamCtx): Promise<SubResult[]> {
  const r = await run(ctx, "r20-tunnel");
  const notes = notesOf<{ connect_status: number }>(r.runDir);
  const logged = gateLog(r.runDir).some((l) => l.kind === "proxy_block" && l.method === "CONNECT" && l.path === "example.com:443" && l.status === 403);
  return [check("R20", "tunnel", [
    [notes?.connect_status === 403, `CONNECT example.com:443 → ${notes?.connect_status ?? "?"}`],
    [logged, "proxy_block CONNECT 403 in the gate log"],
  ])];
}
