import type { AgentAdapter } from "../adapter.js";
import { buildCodexArgv } from "./argv.js";
import { parseCodexLine } from "./stream.js";

// Демо промпт т. 8.3: Codex CLI as a separate process in the sandbox (like claude in E0). env = secrets only; CODEX_HOME
// is public env of the agent phase (envForPhase, tokenName OPENAI_API_KEY).
export function codexAdapter(o: { model: string; cliVersion: "0.160.1" }): AgentAdapter {
  return {
    id: "codex",
    supportsSteering: false,
    launch(ctx, channel, canary) {
      if (!("OPENAI_API_KEY" in channel)) throw new Error("codex needs an openai channel");
      return { argv: buildCodexArgv({ model: o.model, prompt: ctx.prompt }), env: { OPENAI_API_KEY: channel.OPENAI_API_KEY, [canary.name]: canary.value }, stdin: "closed" };
    },
    parseLine: parseCodexLine,
  };
}
