// Round 2: the metrics page. Pure: the server builds one MetricTask per finished task, this sums them for a window.
// "Without you": an accepted change no person decided on (it went in by itself, by the twin, or after Mandat's own retries).

export interface MetricTask {
  id: string;
  /** when the task reached its end state (ISO) */
  finished_at: string;
  outcome: "accepted" | "rejected" | "failed" | "stopped";
  usd: number;
  /** how many times a person decided on it: approvals, rejections, runs again, notes, steering */
  human: number;
  by_twin: boolean;
  /** new attempts Mandat started by itself (D-521) */
  self_retries: number;
}
export interface MetricWeek { from: string; accepted: number; withoutYou: number }
export interface Metrics {
  days: number;
  finished: number;
  accepted: number;
  withoutYou: number;
  byTwin: number;
  selfRetries: number;
  usd: number;
  successRate: number | null;
  withoutYouRate: number | null;
  usdPerAccepted: number | null;
  twin: { scored: number; correct: number; rate: number | null };
  weeks: MetricWeek[];
}

const DAY = 86_400_000;
const WEEKS = 4;
const rate = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function metricsOf(tasks: readonly MetricTask[], o: { now: string; days: number; twin: { scored: number; correct: number } }): Metrics {
  const now = Date.parse(o.now);
  const at = (t: MetricTask) => Date.parse(t.finished_at);
  const known = tasks.filter((t) => Number.isFinite(at(t)) && at(t) <= now);
  const inWindow = known.filter((t) => now - at(t) < o.days * DAY);
  const accepted = inWindow.filter((t) => t.outcome === "accepted");
  const alone = accepted.filter((t) => t.human === 0);
  const usd = inWindow.reduce((s, t) => s + t.usd, 0);
  const weeks = Array.from({ length: WEEKS }, (_, i): MetricWeek => {
    const from = now - (WEEKS - i) * 7 * DAY;
    const to = from + 7 * DAY;
    const ws = known.filter((t) => at(t) >= from && at(t) < to && t.outcome === "accepted");
    return { from: new Date(from).toISOString().slice(0, 10), accepted: ws.length, withoutYou: ws.filter((t) => t.human === 0).length };
  });
  return {
    days: o.days,
    finished: inWindow.length,
    accepted: accepted.length,
    withoutYou: alone.length,
    byTwin: accepted.filter((t) => t.by_twin).length,
    selfRetries: inWindow.reduce((s, t) => s + t.self_retries, 0),
    usd,
    successRate: rate(accepted.length, inWindow.length),
    withoutYouRate: rate(alone.length, accepted.length),
    // a run through a subscription has no metered cost: no figure rather than a false $0
    usdPerAccepted: usd > 0 ? rate(usd, accepted.length) : null,
    twin: { ...o.twin, rate: rate(o.twin.correct, o.twin.scored) },
    weeks,
  };
}
