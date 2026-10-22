import { channelToken } from "../adapter.js";
import type { AgentAdapter, FakeCodexScenario, FakeScenario } from "../adapter.js";
import { parseCodexLine } from "../codex/stream.js";
import { parseStreamLine } from "../claude/stream.js";
import { claudeToStream } from "../claude/to-stream.js";
import { codexToStream } from "../codex/to-stream.js";

/** D-012: the fake runs INSIDE the same sandbox with the same env; its stdout follows D-130. */
export function fakeAdapter(scenario: FakeScenario): AgentAdapter {
  return {
    id: `fake:${scenario}`,
    supportsSteering: false,
    launch(_ctx, channel, canary) {
      return {
        argv: ["node", `/opt/mandat/fakes/${scenario}.mjs`],
        env: { ANTHROPIC_API_KEY: channelToken(channel), [canary.name]: canary.value },
        stdin: "closed",
      };
    },
    parseLine: parseStreamLine,
    toStream: claudeToStream,
  };
}

/** E3в: a fake Codex in the same sandbox; JSONL in the Codex format; OPENAI_API_KEY = the mdt_ token. */
export function fakeCodexAdapter(scenario: FakeCodexScenario): AgentAdapter {
  return {
    id: `fake-codex:${scenario}`,
    supportsSteering: false,
    launch(_ctx, channel, canary) {
      return { argv: ["node", `/opt/mandat/fakes/codex-${scenario}.mjs`], env: { OPENAI_API_KEY: channelToken(channel), [canary.name]: canary.value }, stdin: "closed" };
    },
    parseLine: parseCodexLine,
    toStream: codexToStream,
  };
}
