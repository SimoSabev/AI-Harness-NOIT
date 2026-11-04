import type { AgentAdapter } from "../adapter.js";
import { buildKimiArgv } from "./argv.js";
import { parseKimiLine } from "./stream.js";
import { kimiToStream } from "./to-stream.js";

// D-464 (spike 2026-11-04): Kimi Code CLI with the person's own subscription login only (D-295): the profile volume is
// KIMI_CODE_HOME, the harness gives it no token. The rendered contract is the prompt; Kimi has no compiled control layer,
// so ctx.harness.argv is ignored and only its env passes through. No providerNotice: the spike shows no stderr retry shape
// (retries are `turn.step.retrying` lines on stdout) [НП: a live run].
export function kimiAdapter(o: { model: string; cliVersion: "2.4.1" }): AgentAdapter {
  return {
    id: "kimi",
    supportsSteering: false,
    launch(ctx, channel, canary) {
      if (!("PROFILE" in channel)) throw new Error("kimi runs only with a subscription profile");
      const argv = buildKimiArgv({ model: o.model, prompt: ctx.contractText });
      const publicEnv = ctx.harness && Object.keys(ctx.harness.env).length > 0 ? { publicEnv: { ...ctx.harness.env } } : {};
      return { argv, env: { [canary.name]: canary.value }, stdin: "closed", ...publicEnv };
    },
    parseLine: parseKimiLine,
    toStream: kimiToStream,
  };
}
