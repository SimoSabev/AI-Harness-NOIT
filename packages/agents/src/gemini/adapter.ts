import type { AgentAdapter } from "../adapter.js";
import { buildGeminiArgv } from "./argv.js";
import { parseGeminiLine } from "./stream.js";
import { geminiToStream } from "./to-stream.js";

// E9в (spec 5.3, D-423, D-428): Gemini CLI as a separate process in the sandbox. With an API key the agent gets only the
// mdt_ token as GEMINI_API_KEY; the gate as GOOGLE_GEMINI_BASE_URL, GEMINI_CLI_HOME and the trust flag are the sandbox's
// public env (envForPhase, tokenName GEMINI_API_KEY); the image's root-owned /etc/gemini-cli/settings.json picks API-key
// auth (the CLI skips a settings file under /m, D-431); a compiled profile adds --policy and --include-directories. A
// Google login profile (D-295)
// would use the CLI's own login — off until Q-073.
export function geminiAdapter(o: { model: string; cliVersion: "0.65.0" }): AgentAdapter {
  return {
    id: "gemini",
    supportsSteering: false,
    launch(ctx, channel, canary) {
      if (!("PROFILE" in channel) && !("GEMINI_API_KEY" in channel)) throw new Error("gemini needs a gemini channel");
      const argv = buildGeminiArgv({ model: o.model, prompt: ctx.prompt });
      // the compiled control layer (policies) goes before -p <prompt>
      if (ctx.harness) argv.splice(argv.length - 2, 0, ...ctx.harness.argv);
      const publicEnv = ctx.harness && Object.keys(ctx.harness.env).length > 0 ? { publicEnv: { ...ctx.harness.env } } : {};
      const env = "GEMINI_API_KEY" in channel ? { GEMINI_API_KEY: channel.GEMINI_API_KEY, [canary.name]: canary.value } : { [canary.name]: canary.value };
      return { argv, env, stdin: "closed", ...publicEnv };
    },
    parseLine: parseGeminiLine,
    toStream: geminiToStream,
  };
}
