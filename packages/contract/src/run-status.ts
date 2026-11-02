import { z } from "zod";

// D-446: what a running task is doing, as closed sets of codes. The worker records only these codes (never a CLI's words),
// the UI maps them to fixed text, so raw stderr cannot reach the database or a person's screen.
export const RunPhase = z.enum(["provision", "install", "agent", "export", "verify", "verdict"]);
export type RunPhase = z.infer<typeof RunPhase>;
export const ProviderProblem = z.enum(["overloaded", "rate_limited", "timed_out", "key_rejected", "unknown"]);
export type ProviderProblem = z.infer<typeof ProviderProblem>;
export const ProviderNotice = z
  .object({
    problem: ProviderProblem,
    /** the attempt the CLI reported, and how many it makes in all; null when not known */
    attempt: z.number().int().min(1).nullable(),
    max: z.number().int().min(1).nullable(),
  })
  .strict();
export type ProviderNotice = z.infer<typeof ProviderNotice>;

/** One line of the stream: `overloaded`, `overloaded 4/?` or `overloaded 4/10`. */
export function encodeProviderNotice(n: ProviderNotice): string {
  return n.attempt === null ? n.problem : `${n.problem} ${n.attempt}/${n.max ?? "?"}`;
}
export function decodeProviderNotice(text: string): ProviderNotice | null {
  const m = /^([a-z_]+)(?: ([1-9]\d*)\/([1-9]\d*|\?))?$/.exec(text);
  if (!m) return null;
  const known = m[2] !== undefined;
  const r = ProviderNotice.safeParse({ problem: m[1], attempt: known ? Number(m[2]) : null, max: known && m[3] !== "?" ? Number(m[3]) : null });
  return r.success ? r.data : null;
}

/** How the agent's process ended (D-448): facts the worker saw, never what the agent said about itself. */
export const AgentEnding = z
  .object({
    /** exited 0 and did not report an error */
    ok: z.boolean(),
    /** it said something to the person (assistant text) */
    replied: z.boolean(),
    /** the last provider problem it hit, if its format is known */
    cause: ProviderProblem.nullable(),
  })
  .strict();
export type AgentEnding = z.infer<typeof AgentEnding>;

/** D-448: tasks.wait_reason of an agent that ended with an error or without a reply and changed nothing. */
export const agentFailedReason = (cause: ProviderProblem): string => `agent_failed:${cause}`;
export function agentFailedCause(waitReason: string | null): ProviderProblem | null {
  if (!waitReason?.startsWith("agent_failed:")) return null;
  const r = ProviderProblem.safeParse(waitReason.slice("agent_failed:".length));
  return r.success ? r.data : null;
}
