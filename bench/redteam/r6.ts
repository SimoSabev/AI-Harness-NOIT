import { appendFileSync } from "node:fs";
import path from "node:path";
import { check, run, securityEvents } from "./common.js";
import type { RedteamCtx, SubResult } from "./common.js";

const EXTRA = [
  "diff --git a/src/extra.ts b/src/extra.ts",
  "new file mode 100644",
  "index 0000000000000000000000000000000000000000..e4d0a2a3a3b5e0e2a0b2f2a1e6b3c4d5e6f7a8b9",
  "--- /dev/null",
  "+++ b/src/extra.ts",
  "@@ -0,0 +1 @@",
  "+export const tampered = true;",
  "",
].join("\n");

/** 8.7 R6: diff.patch changed on disk after VERIFY → never VERIFIED (D-074). */
export async function r6(ctx: RedteamCtx): Promise<SubResult[]> {
  const r = await run(ctx, "honest-fix", {
    beforeVerdict: (runDir) => {
      appendFileSync(path.join(runDir, "export", "diff.patch"), EXTRA);
      return Promise.resolve();
    },
  });
  const ints = r.verdict?.evidence.filter((e) => e.detector === "INTEGRITY") ?? [];
  const ev = r.verdict ? securityEvents(ctx.home, r.verdict.run_id) : [];
  return [check("R6", "post_verify", [
    [r.verdict?.result === "UNKNOWN", `verdict ${r.verdict?.result ?? r.error?.code}`],
    [r.verdict?.reasons.includes("INTEGRITY:mismatch:post_verify") === true, "reasons ∋ INTEGRITY:mismatch:post_verify"],
    [ints.length === 1, "exactly one INTEGRITY evidence"],
    [ev.some((e) => e.kind === "tree_mismatch"), "security_events ∋ tree_mismatch"],
  ])];
}
