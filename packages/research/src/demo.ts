import type { ResearchReport, ResearchRequestInput, TraceEvent } from "@mandat/contract";
import { runResearch } from "./engine.js";
import { Fetcher } from "./fetch/fetcher.js";
import type { HttpResult } from "./fetch/http.js";
import { fakeModel } from "./model.js";
import type { ModelClient, ModelRequest } from "./model.js";
import type { RouterChannel } from "./router.js";
import { routeRoles } from "./router.js";
import type { SearchProvider } from "./search/providers.js";

// E9г (D-409): a recorded research world — four pages, one search provider and scripted models — for the tests and for
// the offline demo (the live panel and the report without any key or network). Nothing here touches the network.

const html = (title: string, body: string, date = "2024-03-01") =>
  `<html><head><title>${title}</title><meta property="article:published_time" content="${date}"></head><body><article><h1>${title}</h1><p>${body}</p><p>${"Background text that pads the article to a realistic length for the extractor. ".repeat(6)}</p></article></body></html>`;
export const DEMO_PAGES: Record<string, string> = {
  "https://rfc-editor.org/rfc/rfc8785": html("RFC 8785", "The JSON Canonicalization Scheme (JCS) sorts object properties by their UTF-16 code units. It was published in June 2020."),
  "https://ietf.org/jcs-notes": html("JCS notes", "Under JCS, properties are sorted by UTF-16 code units, not by UTF-8 bytes. The scheme was published in June 2020."),
  "https://blog.example.com/jcs": html("A blog", "Some say JCS sorts properties by UTF-8 bytes, which is a common misunderstanding of the spec text.", "2025-01-01"),
  "https://mirror.example.net/rfc8785": html("RFC 8785", "The JSON Canonicalization Scheme (JCS) sorts object properties by their UTF-16 code units. It was published in June 2020."),
};
export const DEMO_QUESTION = "How does JCS sort keys and when was it published?";

export type DemoRole = "planner" | "searcher" | "reader" | "analyst" | "verifier" | "writer";
export type DemoScript = Partial<Record<DemoRole, (r: ModelRequest) => unknown>>;
const roleOf = (r: ModelRequest) => /^ROLE: (\w+)/.exec(r.system)?.[1] ?? "";
export const DEMO_SCRIPT: DemoScript = {
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
  writer: () => ({
    summary: "JCS sorts properties by UTF-16 code units [1, 2] and was published in June 2020 [1, 2, 9].",
    sections: [{ title: "Sorting", body: "The rule is about UTF-16 code units [1].\nThis long sentence states a fact that has no citation at all anywhere." }],
    unresolved: [],
  }),
};

export interface DemoEnv {
  channels: RouterChannel[];
  clientOf: (c: RouterChannel) => ModelClient;
  providers: SearchProvider[];
  fetcher: Fetcher;
  calls: string[];
}
export interface DemoOptions {
  script?: DemoScript;
  usdPerCall?: number;
  urls?: string[];
  pages?: Record<string, string>;
  /** a pause before every answer, so the live panel can be watched */
  delayMs?: number;
}
/** the models, search and pages of the recorded world */
export function demoEnv(o: DemoOptions = {}): DemoEnv {
  const pages = o.pages ?? DEMO_PAGES;
  const wait = () => (o.delayMs ? new Promise((r) => setTimeout(r, o.delayMs)) : Promise.resolve());
  const res = (url: string): HttpResult => {
    const body = pages[url];
    return { url, finalUrl: url, status: body ? 200 : 404, contentType: "text/html", body: Buffer.from(body ?? ""), ms: 3, truncated: false };
  };
  const fetcher = new Fetcher({ get: async (u) => (await wait(), res(u)), respectRobots: false, archive: false, politeMs: 0, sleep: async () => {} });
  const provider: SearchProvider = {
    name: "demo-search",
    scopes: ["web", "docs", "papers", "code"],
    usdPerQuery: 0,
    search: async () => (await wait(), (o.urls ?? Object.keys(pages)).map((url) => ({ url, title: `about ${url}`, snippet: "JSON canonicalization JCS UTF-16 sorting", date: null, provider: "demo-search" }))),
  };
  const ch: RouterChannel = { id: "demo", label: "Demo model", kind: "fake", model: "demo-1", enabled: true, health: "ok", quality: 0.8, cost: 0.1 };
  const calls: string[] = [];
  const script = { ...DEMO_SCRIPT, ...o.script };
  const client = fakeModel(ch, async (r) => {
    await wait();
    const role = roleOf(r) as DemoRole;
    calls.push(role);
    return JSON.stringify(script[role]?.(r) ?? {});
  }, o.usdPerCall ?? 0);
  return { channels: [ch], clientOf: () => client, providers: [provider], fetcher, calls };
}

export interface DemoWorld {
  run: () => Promise<ResearchReport>;
  events: TraceEvent[];
  calls: string[];
}
export function demoWorld(o: DemoOptions & { req?: Partial<ResearchRequestInput>; emit?: (e: TraceEvent) => void; id?: string } = {}): DemoWorld {
  const env = demoEnv(o);
  const routes = routeRoles(env.channels, "balanced");
  if (!routes.ok) throw new Error(routes.why);
  const events: TraceEvent[] = [];
  return {
    events,
    calls: env.calls,
    run: () =>
      runResearch({ question: DEMO_QUESTION, depth: "standard", goal: "balanced", ...o.req }, {
        id: o.id ?? "q_demo", routes: routes.routes, clientOf: env.clientOf, providers: env.providers, fetcher: env.fetcher,
        emit: (e) => {
          events.push(e);
          o.emit?.(e);
        },
      }),
  };
}
