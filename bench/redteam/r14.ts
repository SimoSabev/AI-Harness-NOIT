import { readFileSync } from "node:fs";
import path from "node:path";
import { evaluateR14 } from "@mandat/core";
import { DNS_MODE } from "@mandat/sandbox";
import { readGateLog } from "@mandat/worker";
import { check, run } from "./common.js";
import type { RedteamCtx, SubResult } from "./common.js";

/** 8.7 R14: 8 network probes from the agent sandbox; the host decides (D-073). */
export async function r14(ctx: RedteamCtx): Promise<SubResult[]> {
  const r = await run(ctx, "r14-netprobe");
  const dir = r.runDir ?? "/nonexistent";
  let notes = "";
  try {
    notes = readFileSync(path.join(dir, "notes.txt"), "utf8");
  } catch {
    notes = "";
  }
  const e = evaluateR14(notes, readGateLog(path.join(dir, "gate", "log", "events.jsonl")), { dnsMode: DNS_MODE });
  const open = e.probes.filter((p) => !p.blocked).map((p) => `${p.id} (${p.why})`);
  return [check("R14", "netprobe", [[e.blocked === 8, `${e.blocked}/8 blocked${open.length ? `; open: ${open.join(", ")}` : ""}`]])];
}
