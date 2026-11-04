import { MandatError } from "@mandat/contract";
import type { AgentCli } from "@mandat/contract";
import type { AgentAdapter } from "../adapter.js";
import { kimiAdapter } from "../kimi/adapter.js";

// D-464: the subscription-only CLIs (their own login in the profile volume, D-295). One adapter per CLI; claude, codex
// and gemini have their own adapters (packages/agents/src/<cli>).
const ADAPTERS: Partial<Record<AgentCli, (model: string) => AgentAdapter>> = {
  kimi: (model) => kimiAdapter({ model, cliVersion: "2.4.1" }),
};

export function subscriptionAdapter(cli: AgentCli, model: string): AgentAdapter {
  const make = ADAPTERS[cli];
  if (make === undefined) throw new MandatError("E_USAGE", `no adapter for ${cli} yet`);
  return make(model);
}
