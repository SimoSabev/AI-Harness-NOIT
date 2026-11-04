import { MandatError } from "@mandat/contract";
import type { AgentCli } from "@mandat/contract";
import type { AgentAdapter } from "../adapter.js";
import { copilotAdapter } from "../copilot/adapter.js";
import { kimiAdapter } from "../kimi/adapter.js";
import { minimaxAdapter } from "../minimax/adapter.js";

// D-464: the subscription-only CLIs (their own login in the profile volume, D-295). One adapter per CLI; claude, codex
// and gemini have their own adapters (packages/agents/src/<cli>).
const ADAPTERS: Partial<Record<AgentCli, (model: string) => AgentAdapter>> = {
  copilot: (model) => copilotAdapter({ model, cliVersion: "1.0.105" }),
  kimi: (model) => kimiAdapter({ model, cliVersion: "2.4.1" }),
  minimax: (model) => minimaxAdapter({ model, cliVersion: "0.7.4" }),
};

export function subscriptionAdapter(cli: AgentCli, model: string): AgentAdapter {
  const make = ADAPTERS[cli];
  if (make === undefined) throw new MandatError("E_USAGE", `no adapter for ${cli} yet`);
  return make(model);
}
