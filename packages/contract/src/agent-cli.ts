import { z } from "zod";

// D-464: the vendor CLIs the sandbox can run. Each is also a subscription (SUBSCRIPTIONS); only the first three have a key
// or a saved connection through the proxy (claude | codex | gemini, <cli>+<connection>); the rest run only with the
// person's own login (<cli>@<account>, D-295). No dash: a profile volume mandat-profile-<cli>-<name> maps back to one.
export const AGENT_CLIS = ["claude", "codex", "gemini", "copilot", "kimi", "antigravity", "cursor", "minimax"] as const;
export const AgentCli = z.enum(AGENT_CLIS);
export type AgentCli = z.infer<typeof AgentCli>;
export const KEY_CLIS = ["claude", "codex", "gemini"] as const;
export type KeyCli = (typeof KEY_CLIS)[number];
export const isKeyCli = (c: string): c is KeyCli => (KEY_CLIS as readonly string[]).includes(c);
