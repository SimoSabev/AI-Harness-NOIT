import { codexToStream } from "./to-stream.js";
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
      // D-392: a ChatGPT subscription — Codex's own login in CODEX_HOME (the profile volume), no token
      const sub = "PROFILE" in channel;
      if (!sub && !("OPENAI_API_KEY" in channel)) throw new Error("codex needs an openai channel");
      const argv = buildCodexArgv({ model: o.model, prompt: ctx.prompt, subscription: sub });
      // v5 E8а: the compiled -c flags go before the prompt (the last positional); CODEX_HOME is already public env
      if (ctx.harness) argv.splice(argv.length - 1, 0, ...ctx.harness.argv);
      if (!("OPENAI_API_KEY" in channel)) return { argv, env: { [canary.name]: canary.value }, stdin: "closed" };
      return { argv, env: { OPENAI_API_KEY: channel.OPENAI_API_KEY, [canary.name]: canary.value }, stdin: "closed" };
    },
    parseLine: parseCodexLine,
    toStream: codexToStream,
  };
}
