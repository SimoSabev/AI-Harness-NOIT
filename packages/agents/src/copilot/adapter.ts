import type { AgentAdapter } from "../adapter.js";
import { buildCopilotArgv } from "./argv.js";
import { parseCopilotLine } from "./stream.js";
import { copilotToStream } from "./to-stream.js";

// D-464 (spike 04.11.2026): GitHub Copilot CLI with the person's own GitHub login only (D-295): the profile volume is
// COPILOT_HOME (the token in plaintext there, see COPILOT_SETTINGS); the harness gives it no token. The rendered contract is
// the prompt; Copilot has no compiled control layer here, so ctx.harness.argv is ignored and only its env passes through.
// No providerNotice: the stderr shape of a retry is unknown [НП: a live run].
export function copilotAdapter(o: { model: string; cliVersion: "1.0.105" }): AgentAdapter {
  return {
    id: "copilot",
    supportsSteering: false,
    launch(ctx, channel, canary) {
      if (!("PROFILE" in channel)) throw new Error("copilot runs only with a subscription profile");
      const argv = buildCopilotArgv({ model: o.model, prompt: ctx.contractText });
      const publicEnv = ctx.harness && Object.keys(ctx.harness.env).length > 0 ? { publicEnv: { ...ctx.harness.env } } : {};
      return { argv, env: { [canary.name]: canary.value }, stdin: "closed", ...publicEnv };
    },
    parseLine: parseCopilotLine,
    toStream: copilotToStream,
  };
}
