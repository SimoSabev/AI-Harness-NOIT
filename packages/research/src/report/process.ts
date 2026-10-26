import type { ClaimVerdict, FetchStatus, FetchTier, ResearchReport, ResearchRole, TraceEvent } from "@mandat/contract";

// E9г (D-397): the numbers behind the process map, the timeline and the model table of a report — the same for the
// live panel and the downloaded document. Pure.

export interface LaneSummary {
  id: string;
  title: string;
  queries: string[];
  providers: Record<string, number>;
  results: number;
  fetched: number;
  read: number;
  domains: string[];
  quotes: number;
  rejected: number;
  claims: Record<ClaimVerdict, number>;
  rounds: number;
  stop: string | null;
}
export interface RoleUsage {
  role: ResearchRole;
  channel: string;
  model: string;
  calls: number;
  failed: number;
  input_tokens: number;
  output_tokens: number;
  usd: number;
  ms: number;
}
export interface TimelineBar {
  lane: string;
  kind: "search" | "fetch" | "read" | "model";
  label: string;
  start: number;
  end: number;
  tone: "ok" | "warn" | "bad" | "info";
}
export interface ProcessView {
  lanes: LaneSummary[];
  roles: RoleUsage[];
  tiers: Record<FetchTier, Record<FetchStatus, number>>;
  timeline: TimelineBar[];
  /** ms from the first to the last event */
  span: number;
}

const zeroVerdicts = (): Record<ClaimVerdict, number> => ({ confirmed: 0, single: 0, conflict: 0, unchecked: 0, quote_missing: 0 });
const zeroStatus = (): Record<FetchStatus, number> => ({ ok: 0, thin: 0, blocked: 0, failed: 0, too_large: 0, robots: 0, skipped: 0 });

export function processView(trace: readonly TraceEvent[], lanesIn: ResearchReport["plan"]["lanes"] = []): ProcessView {
  const lanes = new Map<string, LaneSummary>();
  const lane = (id: string, title?: string): LaneSummary => {
    let l = lanes.get(id);
    if (!l) {
      l = { id, title: title ?? id, queries: [], providers: {}, results: 0, fetched: 0, read: 0, domains: [], quotes: 0, rejected: 0, claims: zeroVerdicts(), rounds: 1, stop: null };
      lanes.set(id, l);
    }
    if (title) l.title = title;
    return l;
  };
  for (const p of lanesIn) lane(p.id, p.title);
  const roles = new Map<string, RoleUsage>();
  const tiers = { http: zeroStatus(), browser: zeroStatus(), archive: zeroStatus(), provider: zeroStatus() };
  const timeline: TimelineBar[] = [];
  const t0 = trace.length > 0 ? Date.parse(trace[0]!.at) : 0;
  const tEnd = trace.length > 0 ? Date.parse(trace.at(-1)!.at) : 0;
  const rel = (e: TraceEvent) => Date.parse(e.at) - t0;
  for (const e of trace) {
    switch (e.kind) {
      case "plan":
        for (const p of e.lanes) lane(p.id, p.title);
        break;
      case "query": {
        const l = lane(e.lane ?? "main");
        if (!l.queries.includes(e.query)) l.queries.push(e.query);
        l.providers[e.provider] = (l.providers[e.provider] ?? 0) + 1;
        break;
      }
      case "results":
        lane(e.lane ?? "main").results += e.hits;
        timeline.push({ lane: e.lane ?? "main", kind: "search", label: `${e.provider}: ${e.query}`, start: Math.max(0, rel(e) - e.ms), end: rel(e), tone: e.hits > 0 ? "info" : "warn" });
        break;
      case "fetch": {
        const l = lane(e.lane ?? "main");
        l.fetched++;
        tiers[e.tier][e.status]++;
        timeline.push({ lane: e.lane ?? "main", kind: "fetch", label: `${e.tier} ${e.status}: ${e.domain}`, start: Math.max(0, rel(e) - e.ms), end: rel(e), tone: e.status === "ok" ? "ok" : e.status === "blocked" || e.status === "failed" ? "bad" : "warn" });
        break;
      }
      case "read": {
        const l = lane(e.lane ?? "main");
        l.read++;
        l.quotes += e.quotes;
        l.rejected += e.rejected;
        try {
          const host = new URL(e.url).hostname.replace(/^www\./, "");
          if (!l.domains.includes(host)) l.domains.push(host);
        } catch {
          // a bad URL in the trace: no domain
        }
        break;
      }
      case "reflect": {
        const l = lane(e.lane ?? "main");
        l.rounds = Math.max(l.rounds, e.round + (e.done ? 0 : 1));
        if (e.done) l.stop = e.reason;
        break;
      }
      case "claim":
        lane(e.lane ?? "main").claims[e.verdict]++;
        break;
      case "model_call": {
        const k = `${e.role}|${e.channel}|${e.model}`;
        const r = roles.get(k) ?? { role: e.role, channel: e.channel, model: e.model, calls: 0, failed: 0, input_tokens: 0, output_tokens: 0, usd: 0, ms: 0 };
        r.calls++;
        if (!e.ok) r.failed++;
        r.input_tokens += e.input_tokens;
        r.output_tokens += e.output_tokens;
        r.usd += e.usd;
        r.ms += e.ms;
        roles.set(k, r);
        timeline.push({ lane: e.lane ?? "main", kind: "model", label: `${e.role} · ${e.model}: ${e.purpose}`, start: Math.max(0, rel(e) - e.ms), end: rel(e), tone: e.ok ? "info" : "bad" });
        break;
      }
      default:
        break;
    }
  }
  const order = ["planner", "searcher", "triage", "reader", "analyst", "verifier", "writer"];
  return {
    lanes: [...lanes.values()].filter((l) => l.id !== "main" || l.fetched + l.queries.length > 0),
    roles: [...roles.values()].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || b.calls - a.calls),
    tiers,
    timeline,
    span: Math.max(1, tEnd - t0),
  };
}
