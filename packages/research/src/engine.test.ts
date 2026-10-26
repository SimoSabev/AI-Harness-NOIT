import { describe, expect, it } from "vitest";
import { ResearchReport, TraceEvent } from "@mandat/contract";
import type { ResearchRequestInput } from "@mandat/contract";
import { citationInSource } from "@mandat/core";
import { runResearch } from "./engine.js";
import { Fetcher } from "./fetch/fetcher.js";
import type { HttpResult } from "./fetch/http.js";
import { fakeModel } from "./model.js";
import type { ModelRequest } from "./model.js";
import type { RouterChannel } from "./router.js";
import { routeRoles } from "./router.js";
import type { SearchProvider } from "./search/providers.js";

const html = (title: string, body: string, date = "2024-03-01") =>
  `<html><head><title>${title}</title><meta property="article:published_time" content="${date}"></head><body><article><h1>${title}</h1><p>${body}</p><p>${"Background text that pads the article to a realistic length for the extractor. ".repeat(6)}</p></article></body></html>`;
const PAGES: Record<string, string> = {
  "https://rfc-editor.org/rfc/rfc8785": html("RFC 8785", "The JSON Canonicalization Scheme (JCS) sorts object properties by their UTF-16 code units. It was published in June 2020."),
  "https://ietf.org/jcs-notes": html("JCS notes", "Under JCS, properties are sorted by UTF-16 code units, not by UTF-8 bytes. The scheme was published in June 2020."),
  "https://blog.example.com/jcs": html("A blog", "Some say JCS sorts properties by UTF-8 bytes, which is a common misunderstanding of the spec text.", "2025-01-01"),
  "https://mirror.example.net/rfc8785": html("RFC 8785", "The JSON Canonicalization Scheme (JCS) sorts object properties by their UTF-16 code units. It was published in June 2020."),
};
const res = (url: string): HttpResult => {
  const body = PAGES[url];
  return { url, finalUrl: url, status: body ? 200 : 404, contentType: "text/html", body: Buffer.from(body ?? ""), ms: 3, truncated: false };
};
const fetcher = () => new Fetcher({ get: async (u) => res(u), respectRobots: false, archive: false, politeMs: 0, sleep: async () => {} });
const provider = (urls: string[]): SearchProvider => ({
  name: "fake-search",
  scopes: ["web", "docs", "papers", "code"],
  usdPerQuery: 0,
  search: async () => urls.map((url) => ({ url, title: `about ${url}`, snippet: "JSON canonicalization JCS UTF-16 sorting", date: null, provider: "fake-search" })),
});

type Script = Partial<Record<"planner" | "searcher" | "reader" | "analyst" | "verifier" | "writer", (r: ModelRequest) => unknown>>;
const roleOf = (r: ModelRequest) => /^ROLE: (\w+)/.exec(r.system)?.[1] ?? "";
const defaults: Script = {
  planner: () => ({ strategy: "Two angles", lanes: [{ title: "Sorting", question: "How does JCS sort properties?", scope: "web", rationale: "the rule and its source" }, { title: "Date", question: "When was RFC 8785 published?", scope: "web", rationale: "a date" }] }),
  searcher: () => ({ queries: ["JCS property sorting", "RFC 8785"] }),
  reader: (r) => {
    if (r.user.includes("UTF-8 bytes, which")) return { relevant: true, note: "a blog", quotes: [{ quote: "Some say JCS sorts properties by UTF-8 bytes", claim: "JCS sorts by UTF-8 bytes" }] };
    if (r.user.includes("not by UTF-8 bytes")) return { relevant: true, note: "notes", quotes: [{ quote: "properties are sorted by UTF-16 code units, not by UTF-8 bytes", claim: "JCS sorts by UTF-16 code units" }, { quote: "The scheme was published in June 2020", claim: "published June 2020" }] };
    return { relevant: true, note: "the RFC", quotes: [{ quote: "sorts object properties by their UTF-16 code units", claim: "JCS sorts by UTF-16 code units" }, { quote: "It was published in June 2020.", claim: "published June 2020" }, { quote: "This sentence is not on the page at all, invented.", claim: "made up" }] };
  },
  analyst: () => ({ done: true, reason: "answered", gaps: [], next_queries: [] }),
  verifier: (r) => {
    const ids = (needle: string) => [...r.user.matchAll(/#(\d+) \[[^\]]*\] fact: ([^\n]*)/g)].filter((m) => (m[2] ?? "").includes(needle)).map((m) => Number(m[1]));
    return { claims: [{ text: "JCS sorts object properties by UTF-16 code units.", support: ids("UTF-16"), refute: ids("UTF-8 bytes") }, { text: "RFC 8785 was published in June 2020.", support: ids("June 2020"), refute: [] }] };
  },
  writer: () => ({ summary: "JCS sorts properties by UTF-16 code units [1, 2] and was published in June 2020 [1, 2, 9].", sections: [{ title: "Sorting", body: "The rule is about UTF-16 code units [1].\nThis long sentence states a fact that has no citation at all anywhere." }], unresolved: [] }),
};
function world(o: { script?: Script; usdPerCall?: number; urls?: string[]; req?: Partial<ResearchRequestInput> } = {}) {
  const ch: RouterChannel = { id: "fake", label: "Fake", kind: "fake", model: "fake-1", enabled: true, health: "ok", quality: 0.8, cost: 0.1 };
  const calls: string[] = [];
  const script = { ...defaults, ...o.script };
  const client = fakeModel(ch, (r) => {
    const role = roleOf(r) as keyof Script;
    calls.push(role);
    return JSON.stringify(script[role]?.(r) ?? {});
  }, o.usdPerCall ?? 0);
  const routes = routeRoles([ch], "balanced");
  if (!routes.ok) throw new Error("routes");
  const events: TraceEvent[] = [];
  const run = () =>
    runResearch({ question: "How does JCS sort keys and when was it published?", depth: "standard", goal: "balanced", ...o.req }, {
      id: "q_test1", routes: routes.routes, clientOf: () => client, providers: [provider(o.urls ?? Object.keys(PAGES))], fetcher: fetcher(), emit: (e) => events.push(e),
    });
  return { run, events, calls };
}

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
