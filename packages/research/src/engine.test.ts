import { describe, expect, it } from "vitest";
import { ResearchReport, TraceEvent } from "@mandat/contract";
import { citationInSource } from "@mandat/core";
import { DEMO_PAGES as PAGES, demoWorld as world } from "./demo.js";

describe("the research engine (E9г, AC-13.2–13.4, 13.7)", () => {
  it("standard run: a plan, lanes, sources with hash and final URL, quotes that are substrings, claims with verdicts, a valid report", async () => {
    const w = world();
    const r = await w.run();
    expect(() => ResearchReport.parse(r)).not.toThrow();
    expect(r.status).toBe("done");
    expect(r.plan.lanes.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(r.sources.length).toBeGreaterThanOrEqual(3);
    for (const s of r.sources) expect(s.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // the mirror has the same text as the RFC → one source, not two
    expect(r.sources.filter((s) => s.title === "RFC 8785")).toHaveLength(1);
    for (const q of r.quotes) expect(citationInSource(q.text, PAGES[r.sources.find((s) => s.id === q.source_id)!.url]!.replace(/<[^>]+>/g, " "))).toBe(true);
    for (const c of r.claims) expect(c.quote_ids.length).toBeGreaterThan(0);
  });
  it("AC-13.3: an invented quote is rejected and counted; the writer's unknown source [9] is dropped; an uncited sentence moves to unresolved", async () => {
    const w = world();
    const r = await w.run();
    const reads = w.events.filter((e) => e.kind === "read");
    expect(reads.some((e) => e.kind === "read" && e.rejected === 1)).toBe(true);
    expect(r.quotes.some((q) => q.text.includes("invented"))).toBe(false);
    expect(r.summary).not.toContain("9]");
    expect(r.sections[0]?.body).not.toContain("no citation at all");
    expect(r.unresolved.some((u) => u.includes("no citation at all"))).toBe(true);
  });
  it("AC-13.4: a supporting and a refuting quote → conflict, both quotes kept; two sites → confirmed", async () => {
    const r = await world().run();
    const sorting = r.claims.find((c) => c.text.includes("UTF-16"))!;
    expect(sorting.verdict).toBe("conflict");
    expect(sorting.quote_ids.map((i) => r.quotes[i]!.text).some((t) => t.includes("UTF-8 bytes"))).toBe(true);
    expect(r.claims.find((c) => c.text.includes("June 2020"))!.verdict).toBe("confirmed");
    expect(r.unresolved.some((u) => u.includes("conflict"))).toBe(true);
  });
  it("the trace: numbered, valid, from run_started to run_finished, with model calls, queries and fetches", async () => {
    const w = world();
    await w.run();
    expect(w.events[0]?.kind).toBe("run_started");
    expect(w.events.at(-1)?.kind).toBe("run_finished");
    w.events.forEach((e, i) => {
      expect(e.seq).toBe(i);
      expect(() => TraceEvent.parse(e)).not.toThrow();
    });
    const kinds = new Set(w.events.map((e) => e.kind));
    for (const k of ["plan", "model_call", "query", "results", "fetch", "read", "claim", "section", "budget"]) expect(kinds.has(k as TraceEvent["kind"])).toBe(true);
  });
  it("quick: no planner, one lane, one round", async () => {
    const w = world({ req: { depth: "quick" } });
    const r = await w.run();
    expect(w.calls).not.toContain("planner");
    expect(w.calls).not.toContain("analyst");
    expect(r.plan.lanes).toHaveLength(1);
  });
  it("AC-13.7: the money runs out → gathering stops, the report is partial: budget, and still written", async () => {
    const w = world({ usdPerCall: 0.2, req: { budget_usd: 0.5 } });
    const r = await w.run();
    expect(r.status).toBe("partial");
    expect(r.partial).toBe("budget");
    expect(w.events.at(-1)).toMatchObject({ kind: "run_finished", partial: "budget" });
  });
  it("analyst gaps lead to a second round with its queries; no new facts ends the lane", async () => {
    let n = 0;
    const w = world({ script: { analyst: () => ({ done: false, reason: "need more", gaps: ["the date"], next_queries: [`gap query ${n++}`] }) } });
    await w.run();
    const reflects = w.events.filter((e) => e.kind === "reflect");
    expect(reflects.length).toBeGreaterThan(0);
    expect(w.events.some((e) => e.kind === "query" && e.query.startsWith("gap query"))).toBe(true);
  });
  it("models down → the run still ends with a report and the reasons in the trace", async () => {
    const w = world({ script: { planner: () => "nonsense", writer: () => "nonsense" } });
    const r = await w.run();
    expect(r.plan.lanes).toHaveLength(1);
    expect(w.events.some((e) => e.kind === "note" && e.text.includes("planner"))).toBe(true);
    expect(r.summary.length).toBeGreaterThan(0);
  });
});
