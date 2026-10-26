import type { ClaimVerdict, FetchTier, PlanLane, TraceEvent } from "@mandat/contract";
import { processView } from "@mandat/research/report";
import type { LaneSummary, RoleUsage } from "@mandat/research/report";

// E9d (D-409): what the live panel shows, from the events alone (the same events the report keeps). Pure.

export type Phase = "plan" | "search" | "read" | "verify" | "write" | "done";
export const PHASES: readonly Exclude<Phase, "done">[] = ["plan", "search", "read", "verify", "write"];
export type LaneState = "waiting" | "searching" | "reading" | "done";
export interface LiveLane extends LaneSummary {
  state: LaneState;
  scope: string;
  now: string | null;
}
export interface LiveSource {
  id: string;
  url: string;
  domain: string;
  tier: FetchTier | null;
  quotes: number;
  lane: string | null;
}
export interface LiveState {
  phase: Phase;
  strategy: string | null;
  lanes: LiveLane[];
  roles: RoleUsage[];
  sources: LiveSource[];
  claims: { id: string; text: string; verdict: ClaimVerdict; sources: number }[];
  counts: { queries: number; pages: number; quotes: number; claims: number; domains: number; tokens: number; usd: number };
  cap: number | null;
  started: string | null;
  finished: string | null;
}

function phaseOf(e: TraceEvent): Phase | null {
  switch (e.kind) {
    case "run_started":
    case "plan":
      return "plan";
    case "query":
    case "results":
      return "search";
    case "fetch":
    case "read":
      return "read";
    case "claim":
      return "verify";
    case "section":
      return "write";
    case "model_call":
      return e.role === "verifier" ? "verify" : e.role === "writer" ? "write" : e.role === "planner" ? "plan" : null;
    case "run_finished":
      return "done";
    default:
      return null;
  }
}

export function liveState(events: readonly TraceEvent[]): LiveState {
  const v = processView(events);
  let phase: Phase = "plan";
  let strategy: string | null = null;
  let plan: PlanLane[] = [];
  let cap: number | null = null;
  const laneNow = new Map<string, { state: LaneState; now: string | null }>();
  const sources = new Map<string, LiveSource>();
  const tierOf = new Map<string, FetchTier>();
  const claims: LiveState["claims"] = [];
  let tokens = 0;
  let usd = 0;
  let finished: string | null = null;
  for (const e of events) {
    const p = phaseOf(e);
    if (p) phase = p;
    if (e.lane) {
      const cur = laneNow.get(e.lane) ?? { state: "waiting" as LaneState, now: null };
      if (e.kind === "query") laneNow.set(e.lane, { state: "searching", now: e.query });
      else if (e.kind === "fetch") laneNow.set(e.lane, { state: "reading", now: e.domain });
      else if (e.kind === "reflect" && e.done) laneNow.set(e.lane, { state: "done", now: null });
      else if (e.kind === "reflect") laneNow.set(e.lane, { state: "searching", now: e.next_queries[0] ?? null });
      else if (!laneNow.has(e.lane)) laneNow.set(e.lane, cur);
    }
    switch (e.kind) {
      case "run_started":
        cap = e.budget_usd;
        break;
      case "plan":
        strategy = e.strategy;
        plan = e.lanes;
        break;
      case "fetch":
        if (e.status === "ok") tierOf.set(e.url, e.tier);
        break;
      case "read":
        sources.set(e.source_id, { id: e.source_id, url: e.url, domain: hostOf(e.url), tier: tierOf.get(e.url) ?? null, quotes: e.quotes, lane: e.lane });
        break;
      case "claim":
        claims.push({ id: e.claim_id, text: e.text, verdict: e.verdict, sources: e.sources });
        break;
      case "model_call":
        tokens += e.input_tokens + e.output_tokens;
        usd += e.usd;
        break;
      case "budget":
        usd = Math.max(usd, e.spent_usd);
        break;
      case "run_finished":
        finished = e.at;
        for (const k of laneNow.keys()) laneNow.set(k, { state: "done", now: null });
        break;
      default:
        break;
    }
  }
  const byId = new Map(v.lanes.map((l) => [l.id, l]));
  const lanes: LiveLane[] = plan.map((p) => {
    const s = byId.get(p.id) ?? { id: p.id, title: p.title, queries: [], providers: {}, results: 0, fetched: 0, read: 0, domains: [], quotes: 0, rejected: 0, claims: { confirmed: 0, single: 0, conflict: 0, unchecked: 0, quote_missing: 0 }, rounds: 1, stop: null };
    const n = laneNow.get(p.id) ?? { state: finished ? "done" : "waiting", now: null };
    return { ...s, title: p.title, scope: p.scope, state: n.state, now: n.now };
  });
  const src = [...sources.values()];
  return {
    phase: finished ? "done" : phase,
    strategy,
    lanes,
    roles: v.roles,
    sources: src,
    claims,
    counts: { queries: v.lanes.reduce((a, l) => a + l.queries.length, 0), pages: src.length, quotes: src.reduce((a, s) => a + s.quotes, 0), claims: claims.length, domains: new Set(src.map((s) => s.domain)).size, tokens, usd: Math.round(usd * 1e4) / 1e4 },
    cap,
    started: events[0]?.at ?? null,
    finished,
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
