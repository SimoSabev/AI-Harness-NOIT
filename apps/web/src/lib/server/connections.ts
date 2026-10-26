import type { Connection, DetectReply, Preferences } from "@mandat/contract";
import type { Lang } from "../../i18n/t";
import { taskAgents } from "../agents";
import type { TaskAgent } from "../agents";
import { controlKeys } from "./keys";

// D-393: what the task box, /welcome and Settings → Models need from `mandat local`, in one round of calls.
export interface AgentsView {
  /** false = no `mandat local` (hosted): nothing to connect from here */
  local: boolean;
  agents: TaskAgent[];
  connections: Connection[];
  prefs: Preferences;
  accountName: string;
}

const NO_PREFS: Preferences = { defaultAgent: null, defaultModel: null, onboarded: false };

export async function agentsView(lang: Lang, env: Record<string, string | undefined> = process.env): Promise<AgentsView> {
  const ctl = controlKeys(env);
  if (!ctl) return { local: false, agents: [], connections: [], prefs: NO_PREFS, accountName: "lichno" };
  const [status, accounts, conns] = await Promise.all([ctl.status(), ctl.accounts(), ctl.connections()]);
  const connections = conns?.connections ?? [];
  const prefs = conns?.preferences ?? NO_PREFS;
  const agents = taskAgents({ accounts, keys: status.providers, connections, demo: env.MANDAT_DEMO_AGENTS === "1", preferred: prefs.defaultAgent }, lang);
  const taken = new Set(accounts.map((a) => a.name));
  const accountName = ["lichno", "moy", "main", "work"].find((n) => !taken.has(n)) ?? `acct-${taken.size + 1}`;
  return { local: true, agents, connections, prefs, accountName };
}

export async function detectLocal(env: Record<string, string | undefined> = process.env): Promise<DetectReply | null> {
  return (await controlKeys(env)?.detect()) ?? null;
}
