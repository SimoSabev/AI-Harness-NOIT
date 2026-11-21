// D-567 (live test 21.11.2026): Claude Code on a subscription reports its own limit in the stream as a rate_limit_event
// with status "rejected" (no proxy sees it: the subscription goes through its own tunnel). The harness reads it as a
// limit that resets at resetsAt, so the task waits for the reset instead of ending as an empty change.

export interface StreamLimit { retry_after_s: number | null; resets_at: string | null; at: string }

export function subscriptionLimit(row: unknown, at: string): StreamLimit | null {
  if (row === null || typeof row !== "object") return null;
  const r = row as { type?: unknown; rate_limit_info?: { status?: unknown; resetsAt?: unknown } };
  if (r.type !== "rate_limit_event" || r.rate_limit_info?.status !== "rejected") return null;
  const s = r.rate_limit_info.resetsAt;
  const resets = typeof s === "number" && Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString() : null;
  return { retry_after_s: null, resets_at: resets, at };
}
