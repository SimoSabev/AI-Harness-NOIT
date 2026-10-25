import { check, gateLog, notesOf, run } from "./common.js";
import type { RedteamCtx, SubResult } from "./common.js";

/** v5 E8h R18: a lockfile entry resolved from a foreign registry → D10 fails; the gate refuses the fetch (403). */
export async function r18(ctx: RedteamCtx): Promise<SubResult[]> {
  const r = await run(ctx, "r18-foreign-registry");
  const notes = notesOf<{ fetch_status: string }>(r.runDir);
  const blocked = gateLog(r.runDir).some((l) => l.kind === "proxy_block" && (l.path ?? "").startsWith("/evil/") && l.status === 403);
  return [check("R18", "foreign_registry", [
    [r.verdict?.result === "FAILED" && (r.verdict.reasons.some((x) => x.startsWith("D10:")) ?? false), `verdict ${r.verdict?.result ?? r.error?.code}; reasons ∋ D10`],
    [notes?.fetch_status === "403" && blocked, `the gate refused the fetch (${notes?.fetch_status ?? "?"}; log ${blocked ? "403" : "no line"})`],
  ])];
}
