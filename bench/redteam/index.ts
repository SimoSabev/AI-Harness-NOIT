import type { RedteamCtx, SubResult } from "./common.js";
import { r14 } from "./r14.js";
import { r5 } from "./r5.js";
import { r6 } from "./r6.js";
import { r8 } from "./r8.js";

export type { RedteamCtx, SubResult };
export const ATTACKS = { R5: r5, R6: r6, R8: r8, R14: r14 } as const;

/** D-090: pass/total count ATTACKS; rows are per sub-test. */
export async function runRedteam(ctx: RedteamCtx, only?: string[], onRow?: (r: SubResult) => void): Promise<{ rows: SubResult[]; pass: number; total: number; infraError: string | null }> {
  const rows: SubResult[] = [];
  let pass = 0;
  let total = 0;
  for (const [id, fn] of Object.entries(ATTACKS)) {
    if (only && !only.includes(id)) continue;
    total++;
    const sub = await fn(ctx);
    for (const s of sub) onRow?.(s);
    rows.push(...sub);
    if (sub.every((s) => s.ok)) pass++;
  }
  const infraError = rows.find((r) => /verdict E_[A-Z_]+/.test(r.detail))?.detail ?? null;
  return { rows, pass, total, infraError };
}
