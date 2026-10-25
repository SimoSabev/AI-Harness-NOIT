import { channelToken, claudeSteerLine } from "../adapter.js";
import { steeringFirstLine } from "../claude/argv.js";
import type { AgentAdapter, FakeCodexScenario, FakeScenario } from "../adapter.js";
import { parseCodexLine } from "../codex/stream.js";
import { parseStreamLine } from "../claude/stream.js";
import { claudeToStream } from "../claude/to-stream.js";
import { codexToStream } from "../codex/to-stream.js";

/** D-012: the fake runs INSIDE the same sandbox with the same env; its stdout follows D-130. */
export function fakeAdapter(scenario: FakeScenario): AgentAdapter {
  return {
    id: `fake:${scenario}`,
    supportsSteering: scenario === "steer-echo",
    launch(ctx, channel, canary) {
      // the fake gets the same control-layer argv/env Claude Code would (sh2-probe reads --settings from it)
      return {
        argv: ["node", `/opt/mandat/fakes/${scenario}.mjs`, ...(ctx.harness?.argv ?? [])],
        env: { ANTHROPIC_API_KEY: channelToken(channel), [canary.name]: canary.value },
        ...(ctx.steer && scenario === "steer-echo" ? { stdin: "pipe" as const, firstStdinLine: steeringFirstLine(ctx.prompt) } : { stdin: "closed" as const }),
        ...(ctx.harness ? { publicEnv: { ...ctx.harness.env } } : {}),
      };
    },
    parseLine: parseStreamLine,
    toStream: claudeToStream,
    ...(scenario === "steer-echo" ? { steerLine: claudeSteerLine } : {}),
  };
}

/** E3в: a fake Codex in the same sandbox; JSONL in the Codex format; OPENAI_API_KEY = the mdt_ token. */
export function fakeCodexAdapter(scenario: FakeCodexScenario): AgentAdapter {
  return {
    id: `fake-codex:${scenario}`,
    supportsSteering: false,
    launch(ctx, channel, canary) {
      return { argv: ["node", `/opt/mandat/fakes/codex-${scenario}.mjs`, ...(ctx.harness?.argv ?? [])], env: { OPENAI_API_KEY: channelToken(channel), [canary.name]: canary.value }, stdin: "closed" };
    },
    parseLine: parseCodexLine,
    toStream: codexToStream,
  };
}
