import { claudeToStream } from "./to-stream.js";
import { argAfter } from "../adapter.js";
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
        // D-342: a subscription cannot run --bare (bare mode never reads OAuth credentials); D-343: the harness layer
        control:
          "PROFILE" in channel || ctx.harness
            ? { variant: "PROFILE" in channel ? "B" : "A", settingsFile: ctx.harness ? argAfter(ctx.harness.argv, "--settings") : null, mcpConfigFile: ctx.harness ? argAfter(ctx.harness.argv, "--mcp-config") : null }
            : undefined,
      });
      const publicEnv = ctx.harness ? { ...ctx.harness.env } : undefined;
      if ("PROFILE" in channel) return { argv, env: { [canary.name]: canary.value }, stdin: "closed", ...(publicEnv ? { publicEnv } : {}) }; // D-295
      if (!("ANTHROPIC_API_KEY" in channel)) throw new Error("claude needs an anthropic channel");
      return { argv, env: { ANTHROPIC_API_KEY: channel.ANTHROPIC_API_KEY, [canary.name]: canary.value }, stdin: "closed", ...(publicEnv ? { publicEnv } : {}) };
    },
    parseLine: parseStreamLine,
    toStream: claudeToStream,
  };
}
