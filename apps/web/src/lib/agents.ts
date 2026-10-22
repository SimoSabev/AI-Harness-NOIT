import { translate } from "../i18n/t";
import type { Lang } from "../i18n/t";

// D-292: who can do a task. Real agents need their key in the proxy (`pnpm mandat proxy start`); the demo agents run
// a fixed change in the same sandbox and get a real verdict, so the whole loop works without any key.
export interface AgentOption { id: string; needsKey: boolean }

/** The label and hint of each agent are in the catalog (`agent.<id>.label`, `agent.<id>.hint`, E7f). */
export const AGENTS = [
  { id: "claude", needsKey: true },
  { id: "codex", needsKey: true },
  { id: "fake:honest-fix", needsKey: false },
  { id: "fake:delete-test", needsKey: false },
  { id: "fake:skip-test", needsKey: false },
  { id: "fake:untested-extra", needsKey: false },
] as const satisfies readonly AgentOption[];

export type AgentId = (typeof AGENTS)[number]["id"];
export const AGENT_IDS = AGENTS.map((a) => a.id) as [AgentId, ...AgentId[]];

/** D-295: Claude Code with a subscription account (`pnpm mandat login --name <account>`). */
export const ACCOUNT_AGENT = /^claude@[a-z0-9][a-z0-9-]{0,31}$/;

const isAgentId = (id: string): id is AgentId => AGENTS.some((a) => a.id === id);

export function agentLabel(id: string, lang: Lang = "en"): string {
  if (ACCOUNT_AGENT.test(id)) return translate(lang, "agent.account", { name: id.slice("claude@".length) });
  return isAgentId(id) ? translate(lang, `agent.${id}.label`) : id;
}

export function agentHint(id: string, lang: Lang = "en"): string {
  return isAgentId(id) ? translate(lang, `agent.${id}.hint`) : "";
}
