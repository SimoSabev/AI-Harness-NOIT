import type { AgentAdapter } from "../adapter.js";
import { buildClaudeArgv } from "./argv.js";
import { parseStreamLine } from "./stream.js";

export function claudeAdapter(o: { model: string; cliVersion: "2.1.302" }): AgentAdapter {
  return {
    id: "claude",
    supportsSteering: false,
    launch(ctx, channel, canary) {
      const argv = buildClaudeArgv({
        prompt: ctx.prompt,
        model: o.model,
        budgetUsd: ctx.budgetUsd,
        appendSystemPromptFile: ctx.contractFile,
        memory: { enabled: false },
        steering: { enabled: false },
      });
      if ("PROFILE" in channel) return { argv, env: { [canary.name]: canary.value }, stdin: "closed" }; // D-295
      if (!("ANTHROPIC_API_KEY" in channel)) throw new Error("claude needs an anthropic channel");
      return { argv, env: { ANTHROPIC_API_KEY: channel.ANTHROPIC_API_KEY, [canary.name]: canary.value }, stdin: "closed" };
    },
    parseLine: parseStreamLine,
  };
}
