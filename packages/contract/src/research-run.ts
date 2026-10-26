import { z } from "zod";
import { ClaimVerdict, Quote, ResearchDepth, ResearchScope, SourceId, SourceRecord } from "./research.js";

// E9г (D-392): one research run — the request (goal + which model does which role), the live trace the right-hand panel
// shows, and the report a person downloads. The engine is packages/research; these are its only shapes.

/** Who does what. planner: sub-questions and lanes; searcher: queries; triage: which hits to read; reader: verbatim quotes
 * from a page; analyst: per-lane reflection (gaps, next queries); verifier: support/refute between claims; writer: the report. */
export const RESEARCH_ROLES = ["planner", "searcher", "triage", "reader", "analyst", "verifier", "writer"] as const;
export const ResearchRole = z.enum(RESEARCH_ROLES);
export type ResearchRole = z.infer<typeof ResearchRole>;
/** economy: the cheapest healthy model everywhere it is good enough; quality: the best model where it matters. */
export const ResearchGoal = z.enum(["economy", "balanced", "quality"]);
export type ResearchGoal = z.infer<typeof ResearchGoal>;
const ChannelId = z.string().min(1).max(64);
const Host = z.string().regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i);

export const ResearchRequest = z
  .object({
    question: z.string().min(1).max(2000),
    depth: ResearchDepth,
    goal: ResearchGoal,
    /** free text for the planner and the writer: focus, what to avoid, the shape of the answer */
    instructions: z.string().max(2000).default(""),
    /** a fixed channel per role; a role left out is chosen by the goal */
    routing: z.partialRecord(ResearchRole, ChannelId).default({}),
    scopes: z.array(ResearchScope).min(1).max(5).default(["web"]),
    include_domains: z.array(Host).max(50).default([]),
    exclude_domains: z.array(Host).max(50).default([]),
    recency: z.enum(["any", "year", "month", "week"]).default("any"),
    /** null = the depth's default (depthBudget) */
    budget_usd: z.number().positive().max(20).nullable().default(null),
    language: z.enum(["auto", "bg", "en"]).default("auto"),
    /** search providers to use; empty = every configured one for the scope */
    providers: z.array(z.string().min(1).max(64)).max(20).default([]),
    respect_robots: z.boolean().default(true),
    repo: z.string().max(200).nullable().default(null),
  })
  .strict();
export type ResearchRequest = z.infer<typeof ResearchRequest>;
export type ResearchRequestInput = z.input<typeof ResearchRequest>;

export interface DepthBudget {
  usd: number;
  lanes: number;
  /** pages read (fetched and passed to a reader) over the whole run */
  pages: number;
  queries: number;
  /** search → read → reflect rounds per lane (the first round + gap rounds) */
  rounds: number;
  /** all roles together, input + output */
  tokens: number;
  minutes: number;
}
// D-406 (docs/prd/research/research-strategies.md §7.3): caps, not targets; typical runs cost less. Replaces the
// $0.10/$0.50/$2.00 of D-359, which left no room for a gap round in standard.
const BUDGETS: Record<ResearchDepth, DepthBudget> = {
  quick: { usd: 0.25, lanes: 1, pages: 8, queries: 6, rounds: 1, tokens: 150_000, minutes: 2 },
  standard: { usd: 1, lanes: 3, pages: 30, queries: 24, rounds: 2, tokens: 1_000_000, minutes: 8 },
  deep: { usd: 8, lanes: 8, pages: 120, queries: 80, rounds: 4, tokens: 4_000_000, minutes: 25 },
};
export const depthBudget = (d: ResearchDepth): DepthBudget => ({ ...BUDGETS[d] });

export const LaneId = z.string().regex(/^(main|l[0-9]{1,2})$/);
export const RoleAssignment = z
  .object({ role: ResearchRole, channel: z.string().min(1).max(80), channel_kind: z.enum(["api_key", "cli_profile", "local", "fake"]), model: z.string().min(1).max(80) })
  .strict();
export type RoleAssignment = z.infer<typeof RoleAssignment>;
export const PlanLane = z
  .object({ id: LaneId, title: z.string().min(1).max(160), question: z.string().min(1).max(1000), scope: ResearchScope, rationale: z.string().max(500) })
  .strict();
export type PlanLane = z.infer<typeof PlanLane>;
export const FetchTier = z.enum(["http", "browser", "archive", "provider"]);
export type FetchTier = z.infer<typeof FetchTier>;
export const FetchStatus = z.enum(["ok", "thin", "blocked", "failed", "too_large", "robots", "skipped"]);
export type FetchStatus = z.infer<typeof FetchStatus>;
export const ResearchStats = z
  .object({
    queries: z.number().int().min(0),
    results: z.number().int().min(0),
    pages_fetched: z.number().int().min(0),
    pages_read: z.number().int().min(0),
    domains: z.number().int().min(0),
    quotes: z.number().int().min(0),
    claims: z.number().int().min(0),
    input_tokens: z.number().int().min(0),
    output_tokens: z.number().int().min(0),
    usd: z.number().min(0),
    ms: z.number().int().min(0),
  })
  .strict();
export type ResearchStats = z.infer<typeof ResearchStats>;
export const RunStatus = z.enum(["done", "partial", "failed"]);
export const PartialReason = z.enum(["budget", "timeout", "providers_down", "models_down", "stopped"]);
export type PartialReason = z.infer<typeof PartialReason>;

const Text = (n: number) => z.string().max(n);
const Base = { seq: z.number().int().min(0), at: z.string().datetime(), lane: LaneId.nullable() };
const ev = <K extends string, S extends z.ZodRawShape>(kind: K, shape: S) => z.object({ ...Base, kind: z.literal(kind), ...shape }).strict();
const Hit = z.object({ url: z.string().max(2000), title: Text(300), domain: Text(253) }).strict();
export const TraceEvent = z.discriminatedUnion("kind", [
  ev("run_started", { question: Text(2000), depth: ResearchDepth, goal: ResearchGoal, budget_usd: z.number().min(0), routing: z.array(RoleAssignment).max(RESEARCH_ROLES.length) }),
  ev("plan", { strategy: Text(1000), lanes: z.array(PlanLane).max(12) }),
  ev("model_call", {
    role: ResearchRole,
    channel: Text(80),
    channel_kind: RoleAssignment.shape.channel_kind,
    model: Text(80),
    purpose: Text(120),
    input_tokens: z.number().int().min(0),
    output_tokens: z.number().int().min(0),
    usd: z.number().min(0),
    ms: z.number().int().min(0),
    ok: z.boolean(),
  }),
  ev("query", { provider: Text(64), query: Text(500), scope: ResearchScope }),
  ev("results", { provider: Text(64), query: Text(500), hits: z.number().int().min(0), new_hits: z.number().int().min(0), top: z.array(Hit).max(10), ms: z.number().int().min(0) }),
  ev("fetch", { url: Text(2000), domain: Text(253), tier: FetchTier, status: FetchStatus, http_status: z.number().int().min(100).max(599).nullable(), bytes: z.number().int().min(0), ms: z.number().int().min(0), source_id: SourceId.nullable() }),
  ev("read", { source_id: SourceId, url: Text(2000), quotes: z.number().int().min(0), rejected: z.number().int().min(0), relevant: z.boolean(), note: Text(300) }),
  ev("reflect", { round: z.number().int().min(1), gaps: z.array(Text(300)).max(8), next_queries: z.array(Text(500)).max(12), done: z.boolean(), reason: Text(300) }),
  ev("claim", { claim_id: z.string().regex(/^c[0-9]{1,4}$/), text: Text(500), verdict: ClaimVerdict, sources: z.number().int().min(0) }),
  ev("section", { title: Text(200), chars: z.number().int().min(0) }),
  ev("budget", { spent_usd: z.number().min(0), cap_usd: z.number().min(0), pages: z.number().int().min(0), queries: z.number().int().min(0) }),
  ev("note", { level: z.enum(["info", "warn"]), text: Text(300) }),
  ev("run_finished", { status: RunStatus, partial: PartialReason.nullable(), stats: ResearchStats }),
]);
export type TraceEvent = z.infer<typeof TraceEvent>;
/** an event before the sink numbers and stamps it */
export type TraceDraft = TraceEvent extends infer E ? (E extends TraceEvent ? Omit<E, "seq" | "at"> : never) : never;

export const ReportSource = SourceRecord.omit({ archived_url: true, archive_digest: true })
  .extend({ n: z.number().int().min(1).max(999), domain: Text(253), published: z.string().max(40).nullable(), tier: FetchTier, lane: LaneId })
  .strict();
export type ReportSource = z.infer<typeof ReportSource>;
export const ReportClaim = z
  .object({
    id: z.string().regex(/^c[0-9]{1,4}$/),
    text: z.string().min(1).max(2000),
    verdict: ClaimVerdict,
    /** indexes into report.quotes */
    quote_ids: z.array(z.number().int().min(0)).max(50),
    source_ns: z.array(z.number().int().min(1)).max(50),
    as_of: z.string().max(40).nullable(),
    lane: LaneId,
  })
  .strict();
export type ReportClaim = z.infer<typeof ReportClaim>;
export const ResearchReport = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^q_[a-z0-9_]{1,40}$/),
    request: ResearchRequest,
    status: RunStatus,
    partial: PartialReason.nullable(),
    started_at: z.string().datetime(),
    finished_at: z.string().datetime(),
    routing: z.array(RoleAssignment).max(RESEARCH_ROLES.length),
    plan: z.object({ strategy: Text(1000), lanes: z.array(PlanLane).max(12) }).strict(),
    sources: z.array(ReportSource).max(999),
    quotes: z.array(Quote).max(5000),
    claims: z.array(ReportClaim).max(500),
    /** a short answer on top, with [n] */
    summary: z.string().max(4000),
    sections: z.array(z.object({ title: z.string().min(1).max(200), body: z.string().max(20_000) }).strict()).max(30),
    unresolved: z.array(z.string().max(500)).max(50),
    stats: ResearchStats,
    trace: z.array(TraceEvent).max(20_000),
  })
  .strict();
export type ResearchReport = z.infer<typeof ResearchReport>;
