import { z } from "zod";
import { AgentRefString } from "./connections.js";

// D-647: what is left of a subscription is the provider's own windows (a 5-hour one, a weekly one, …), each with how much
// of it is used and when it resets. Which windows an account has depends on the provider and the plan, so they are never
// listed here: they come from what the unchanged CLI reports in its stream during a task or a conversation. The harness
// never reads the login (D-295) and never calls a usage endpoint with it. Only numbers and times — never a token or text.

export const LimitWindowStatus = z.enum(["allowed", "warning", "rejected"]);
export type LimitWindowStatus = z.infer<typeof LimitWindowStatus>;

export const LimitWindow = z.object({
  /** the provider's own name of the window (Claude: five_hour, seven_day, seven_day_opus, …) */
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  /** its length, from the provider's name; null = a name this version does not know */
  minutes: z.number().int().positive().max(60 * 24 * 31).nullable(),
  /** the used fraction of the window (1 = used up; above 1 is possible past the cap); null = the provider did not say */
  used: z.number().min(0).max(100).nullable(),
  resets_at: z.string().datetime().nullable(),
  status: LimitWindowStatus.nullable(),
}).strict();
export type LimitWindow = z.infer<typeof LimitWindow>;

/** the ledger payload of `limit_windows`: the account's windows as its CLI last reported them */
export const LimitSnapshot = z.object({ agent: AgentRefString, at: z.string().datetime(), windows: z.array(LimitWindow).min(1).max(8) }).strict();
export type LimitSnapshot = z.infer<typeof LimitSnapshot>;

/** the length of Claude's windows by their names (the names say it: five hours, seven days) */
const CLAUDE_MINUTES: Readonly<Record<string, number>> = { five_hour: 300, seven_day: 10080, seven_day_opus: 10080, seven_day_sonnet: 10080, seven_day_overage_included: 10080 };

const Epoch = z.number().int().positive();
const Status = z.enum(["allowed", "allowed_warning", "rejected"]);
const UnifiedWindow = z.object({ utilization: z.number().min(0).max(100), resetsAt: Epoch.optional(), status: Status.optional().catch(undefined) });
const RateLimitInfo = z.object({
  status: Status,
  resetsAt: Epoch.optional().catch(undefined),
  rateLimitType: z.string().regex(/^[a-z0-9_]{1,40}$/).optional().catch(undefined),
  utilization: z.number().min(0).max(100).optional().catch(undefined),
  unifiedWindows: z.record(z.string().regex(/^[a-z0-9_]{1,40}$/), UnifiedWindow).optional(),
});

const iso = (s: number | undefined): string | null => (s === undefined ? null : new Date(s * 1000).toISOString());
const status = (s: z.infer<typeof Status> | undefined): LimitWindowStatus | null => (s === undefined ? null : s === "allowed_warning" ? "warning" : s);

/** Claude Code's `rate_limit_event` (stream-json) → the account's windows; null for any other row or one it cannot read.
 * 2.1.332 (live, 26.11.2026) sends every window in `unifiedWindows`; an older CLI only the limiting one at the top level.
 * `overage` is paid extra usage, not a window. */
export function claudeLimitWindows(row: unknown): LimitWindow[] | null {
  if (row === null || typeof row !== "object" || (row as { type?: unknown }).type !== "rate_limit_event") return null;
  const p = RateLimitInfo.safeParse((row as { rate_limit_info?: unknown }).rate_limit_info);
  if (!p.success) return null;
  const i = p.data;
  const win = (id: string, used: number | null, resets: number | undefined, s: LimitWindowStatus | null): LimitWindow =>
    ({ id, minutes: CLAUDE_MINUTES[id] ?? null, used, resets_at: iso(resets), status: s });
  if (i.unifiedWindows) {
    const out = Object.entries(i.unifiedWindows).map(([id, w]) => win(id, w.utilization, w.resetsAt, status(w.status)));
    return out.length > 0 ? out.slice(0, 8) : null;
  }
  if (!i.rateLimitType || i.rateLimitType === "overage") return null;
  const used = i.utilization ?? (i.status === "rejected" ? 1 : null);
  return [win(i.rateLimitType, used, i.resetsAt, status(i.status))];
}

/** the newest valid snapshot per agent, from ledger payloads in any order; anything that does not parse is skipped */
export function newestWindows(payloads: readonly unknown[]): Record<string, LimitSnapshot> {
  const out: Record<string, LimitSnapshot> = {};
  for (const x of payloads) {
    const p = LimitSnapshot.safeParse(x);
    if (!p.success) continue;
    const prev = out[p.data.agent];
    if (!prev || p.data.at > prev.at) out[p.data.agent] = p.data;
  }
  return out;
}
