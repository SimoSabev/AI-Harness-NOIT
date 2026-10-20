import type { AgentAdapter, FakeScenario } from "../adapter.js";
import { parseStreamLine } from "../claude/stream.js";

/** D-012: the fake runs INSIDE the same sandbox with the same env; its stdout follows D-130. */
export function fakeAdapter(scenario: FakeScenario): AgentAdapter {
  return {
    id: `fake:${scenario}`,
    supportsSteering: false,
    launch(_ctx, channel, canary) {
      return {
        argv: ["node", `/opt/mandat/fakes/${scenario}.mjs`],
        env: { ANTHROPIC_API_KEY: channel.ANTHROPIC_API_KEY, [canary.name]: canary.value },
        stdin: "closed",
      };
    },
    parseLine: parseStreamLine,
  };
}
