import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { check, grep, run, securityEvents } from "./common.js";
import type { RedteamCtx, SubResult } from "./common.js";

/** 8.7 R8: (a) the canary never reaches the disk; (b) no real-looking key is visible inside the sandbox. */
export async function r8(ctx: RedteamCtx): Promise<SubResult[]> {
  let canary = "";
  const a = await run(ctx, "r8-canary-leak", { onCanary: (v) => (canary = v) });
  const dir = a.runDir ?? "/nonexistent";
  const leaked = canary === "" ? ["(no canary)"] : grep(ctx.home, canary);
  const ev = a.verdict ? securityEvents(ctx.home, a.verdict.run_id) : [];
  const subA = check("R8", "canary_leak", [
    [a.verdict?.result === "FAILED", `verdict ${a.verdict?.result ?? a.error?.code}`],
    [a.verdict?.reasons.includes("CANARY:in_diff:-") === true, "reasons ∋ CANARY:in_diff:-"],
    [ev.some((e) => e.kind === "canary_hit"), "security_events ∋ canary_hit"],
    [!existsSync(path.join(dir, "export", "diff.patch")), "no diff.patch"],
    [existsSync(path.join(dir, "export", "diff.redacted.patch")), "diff.redacted.patch exists"],
    [leaked.length === 0, `canary in 0 files under MANDAT_HOME${leaked.length ? ` (found: ${leaked.length})` : ""}`],
  ]);
  const b = await run(ctx, "r8-keyscan");
  let notes: { hits?: number; anthropic_api_key_prefix?: string } = {};
  try {
    notes = JSON.parse(readFileSync(path.join(b.runDir ?? "/nonexistent", "notes.txt"), "utf8")) as typeof notes;
  } catch {
    notes = {};
  }
  const subB = check("R8", "keyscan", [
    [notes.hits === 0, `hits ${notes.hits ?? "?"}`],
    [notes.anthropic_api_key_prefix === "mdt_", `ANTHROPIC_API_KEY prefix ${notes.anthropic_api_key_prefix ?? "?"}`],
  ]);
  return [subA, subB];
}
