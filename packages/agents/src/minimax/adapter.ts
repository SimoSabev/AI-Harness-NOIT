import type { AgentAdapter } from "../adapter.js";
import { buildMinimaxArgv } from "./argv.js";
import { parseMinimaxLine } from "./stream.js";
import { minimaxToStream } from "./to-stream.js";

// D-464 (spike 04.11.2026): MiniMax Code (`mcode exec`) with the person's own M Plan login only (D-295): the profile volume
// is MINIMAX_DATA_DIR, the harness gives it no token. The rendered contract is the prompt; mcode has no compiled control
// layer, so ctx.harness.argv is ignored and only its env passes through. No providerNotice: the stderr shapes beyond
// "mcode exec failed: …" are unknown [НП: a live run].
export function minimaxAdapter(o: { model: string; cliVersion: "0.7.4" }): AgentAdapter {
  return {
    id: "minimax",
    supportsSteering: false,
    launch(ctx, channel, canary) {
      if (!("PROFILE" in channel)) throw new Error("minimax runs only with a subscription profile");
      const argv = buildMinimaxArgv({ model: o.model, prompt: ctx.contractText });
      const publicEnv = ctx.harness && Object.keys(ctx.harness.env).length > 0 ? { publicEnv: { ...ctx.harness.env } } : {};
      return { argv, env: { [canary.name]: canary.value }, stdin: "closed", ...publicEnv };
    },
    parseLine: parseMinimaxLine,
    toStream: minimaxToStream,
  };
}
