import { describe, expect, it } from "vitest";
import { RESEARCH_ROLES, ResearchReport, ResearchRequest, TraceEvent, depthBudget } from "./index.js";

const at = "2026-10-26T10:00:00.000Z";

describe("research run schemas (E9г, D-392)", () => {
  it("a request: question, depth and goal; defaults for scope, budget and routing", () => {
    const r = ResearchRequest.parse({ question: "What is RFC 8785?", depth: "standard", goal: "balanced" });
    expect(r.scopes).toEqual(["web"]);
    expect(r.routing).toEqual({});
    expect(r.budget_usd).toBeNull();
    expect(r.respect_robots).toBe(true);
    expect(() => ResearchRequest.parse({ question: "", depth: "standard", goal: "balanced" })).toThrow();
    expect(() => ResearchRequest.parse({ question: "q", depth: "standard", goal: "cheap" })).toThrow();
  });
  it("routing names a channel per role; an unknown role is rejected", () => {
    const r = ResearchRequest.parse({ question: "q", depth: "deep", goal: "quality", routing: { writer: "ch_opus", reader: "ch_local" } });
    expect(r.routing.writer).toBe("ch_opus");
    expect(() => ResearchRequest.parse({ question: "q", depth: "deep", goal: "quality", routing: { boss: "x" } })).toThrow();
    expect(RESEARCH_ROLES).toContain("planner");
  });
  it("domains are host names, not URLs", () => {
    expect(ResearchRequest.parse({ question: "q", depth: "quick", goal: "economy", include_domains: ["rfc-editor.org"] }).include_domains).toEqual(["rfc-editor.org"]);
    expect(() => ResearchRequest.parse({ question: "q", depth: "quick", goal: "economy", include_domains: ["https://x.org/a"] })).toThrow();
  });
  it("the depth sets the default budget, lanes and pages; deeper is never smaller", () => {
    const q = depthBudget("quick");
    const s = depthBudget("standard");
    const d = depthBudget("deep");
    for (const k of ["usd", "lanes", "pages", "queries", "rounds", "tokens", "minutes"] as const) {
      expect(q[k]).toBeLessThanOrEqual(s[k]);
      expect(s[k]).toBeLessThanOrEqual(d[k]);
    }
    expect(q.lanes).toBe(1);
  });
  it("trace events are a closed union by kind with a sequence number", () => {
    const e = TraceEvent.parse({ seq: 3, at, lane: "l1", kind: "fetch", url: "https://a.org/x", domain: "a.org", tier: "browser", status: "ok", http_status: 200, bytes: 1200, ms: 900, source_id: "src_1" });
    expect(e.kind).toBe("fetch");
    expect(() => TraceEvent.parse({ seq: 3, at, lane: "l1", kind: "teleport" })).toThrow();
    expect(() => TraceEvent.parse({ seq: -1, at, lane: null, kind: "note", level: "info", text: "x" })).toThrow();
    expect(() => TraceEvent.parse({ seq: 1, at, lane: "lane one", kind: "note", level: "info", text: "x" })).toThrow();
  });
  it("a model call says which role, channel and model, and what it cost", () => {
    const e = TraceEvent.parse({ seq: 1, at, lane: null, kind: "model_call", role: "planner", channel: "Opus API", channel_kind: "api_key", model: "claude-opus-5-5", purpose: "plan", input_tokens: 900, output_tokens: 300, usd: 0.02, ms: 2100, ok: true });
    expect(e.kind === "model_call" && e.role).toBe("planner");
  });
  it("a report ties claims to sources by number and keeps the trace", () => {
    const report = ResearchReport.parse({
      version: 1,
      id: "q_abc",
      request: { question: "q", depth: "quick", goal: "economy" },
      status: "done",
      partial: null,
      started_at: at,
      finished_at: at,
      routing: [{ role: "writer", channel: "Local", channel_kind: "local", model: "qwen3" }],
      plan: { strategy: "one lane", lanes: [{ id: "l1", title: "Basics", question: "q", scope: "web", rationale: "" }] },
      sources: [{ n: 1, id: "src_1", provider: "searxng", url: "https://a.org/x", final_url: "https://a.org/x", title: "A", domain: "a.org", content_hash: `sha256:${"a".repeat(64)}`, fetched_at: at, published: null, tier: "http", state: "read", lane: "l1" }],
      quotes: [{ source_id: "src_1", offset: 0, length: 3, text: "abc" }],
      claims: [{ id: "c1", text: "abc holds", verdict: "single", quote_ids: [0], source_ns: [1], as_of: null, lane: "l1" }],
      summary: "abc [1]",
      sections: [{ title: "Answer", body: "abc [1]" }],
      unresolved: [],
      stats: { queries: 1, results: 3, pages_fetched: 1, pages_read: 1, domains: 1, quotes: 1, claims: 1, input_tokens: 10, output_tokens: 5, usd: 0, ms: 10 },
      trace: [],
    });
    expect(report.claims[0]?.source_ns).toEqual([1]);
    expect(() => ResearchReport.parse({ ...report, sources: [{ ...report.sources[0], n: 0 }] })).toThrow();
  });
});
