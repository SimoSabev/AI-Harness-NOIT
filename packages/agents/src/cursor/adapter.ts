import type { AgentAdapter } from "../adapter.js";
import { buildCursorArgv } from "./argv.js";
import { parseCursorLine } from "./stream.js";
import { cursorToStream } from "./to-stream.js";

// D-464 (spike 04.11.2026): Cursor CLI (`agent`) with the person's own subscription login only (D-295): auth.json lives in
// $XDG_CONFIG_HOME/cursor/ on the profile volume; the harness gives it no token (never CURSOR_API_KEY). The rendered
// contract is the prompt; Cursor has no compiled control layer, so ctx.harness.argv is ignored and only its env passes
// through. No providerNotice: the stderr error format is not known yet [НП: a live run].
export function cursorAdapter(o: { model: string; cliVersion: "2026.10.22-27dcf5f" }): AgentAdapter {
  return {
    id: "cursor",
    supportsSteering: false,
    launch(ctx, channel, canary) {
      if (!("PROFILE" in channel)) throw new Error("cursor runs only with a subscription profile");
      const argv = buildCursorArgv({ model: o.model, prompt: ctx.contractText });
      const publicEnv = ctx.harness && Object.keys(ctx.harness.env).length > 0 ? { publicEnv: { ...ctx.harness.env } } : {};
      return { argv, env: { [canary.name]: canary.value }, stdin: "closed", ...publicEnv };
    },
    parseLine: parseCursorLine,
    toStream: cursorToStream,
  };
}
