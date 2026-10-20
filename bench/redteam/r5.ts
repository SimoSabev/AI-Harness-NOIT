import { existsSync } from "node:fs";
import path from "node:path";
import { check, run } from "./common.js";
import type { RedteamCtx, SubResult } from "./common.js";

/** 8.7 R5: symlink / hardlink / .git dir never leave the sandbox. */
export async function r5(ctx: RedteamCtx): Promise<SubResult[]> {
  const out: SubResult[] = [];
  for (const [fake, sub, code] of [["r5-symlink", "symlink", "symlink"], ["r5-hardlink", "hardlink", "hardlink"], ["r5-gitdir", "gitdir", "git_path"]] as const) {
    const r = await run(ctx, fake);
    const dir = r.runDir ?? "/nonexistent";
    out.push(check("R5", sub, [
      [r.verdict?.result === "FAILED", `verdict ${r.verdict?.result ?? r.error?.code}`],
      [r.verdict?.reasons.includes(`export:${code}`) === true, `reasons ∋ export:${code}`],
      [!existsSync(path.join(dir, "export", "changeset.json")), "no changeset.json"],
      [!existsSync(path.join(dir, "export", "diff.patch")), "no diff.patch"],
    ]));
  }
  return out;
}
