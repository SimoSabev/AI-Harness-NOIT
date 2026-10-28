import type { AgentAdapter } from "../adapter.js";
import { GEMINI_HARNESS_DIR, GEMINI_HOME, buildGeminiArgv } from "./argv.js";
import { parseGeminiLine } from "./stream.js";
import { geminiToStream } from "./to-stream.js";

// E9в (spec 5.3, D-423): Gemini CLI as a separate process in the sandbox. With an API key the agent gets only the mdt_
// token as GEMINI_API_KEY and the gate as GOOGLE_GEMINI_BASE_URL (the proxy holds the real key, /v1beta/models/*); with a
// Google login profile (D-295) the unmodified CLI uses its own login in GEMINI_CLI_HOME and the gate's CONNECT tunnels.
export function geminiAdapter(o: { model: string; cliVersion: "0.65.0" }): AgentAdapter {
  return {
    id: "gemini",
    supportsSteering: false,
    launch(ctx, channel, canary) {
      const login = "PROFILE" in channel;
      if (!login && !("GEMINI_API_KEY" in channel)) throw new Error("gemini needs a gemini channel");
      const argv = buildGeminiArgv({ model: o.model, prompt: ctx.prompt });
      // the compiled control layer (policies, settings) goes before -p <prompt>
      if (ctx.harness) argv.splice(argv.length - 2, 0, ...ctx.harness.argv);
      const common = { GEMINI_CLI_HOME: GEMINI_HOME, GEMINI_CLI_TRUST_WORKSPACE: "true", NO_BROWSER: "true" };
      if (!("GEMINI_API_KEY" in channel)) {
        return { argv, env: { [canary.name]: canary.value }, stdin: "closed", publicEnv: { ...common, GEMINI_CLI_SYSTEM_SETTINGS_PATH: `${GEMINI_HARNESS_DIR}/settings-login.json` } };
      }
      return {
        argv, env: { GEMINI_API_KEY: channel.GEMINI_API_KEY, [canary.name]: canary.value }, stdin: "closed",
        publicEnv: { GOOGLE_GEMINI_BASE_URL: channel.GOOGLE_GEMINI_BASE_URL, ...common, GEMINI_CLI_SYSTEM_SETTINGS_PATH: `${GEMINI_HARNESS_DIR}/settings.json` },
      };
    },
    parseLine: parseGeminiLine,
    toStream: geminiToStream,
  };
}
