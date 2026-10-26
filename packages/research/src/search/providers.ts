import Anthropic from "@anthropic-ai/sdk";
import type { ResearchScope } from "@mandat/contract";
import { MandatError } from "@mandat/contract";
import type { Hit } from "../rank.js";

// E9г (D-396): search providers. Our own first — a self-hosted SearXNG (metasearch, no key) and the open APIs of
// Wikipedia, arXiv, Crossref, GitHub and Stack Exchange — then the paid ones the person adds (Exa; Anthropic web search
// through the proxy). A provider's key never reaches the engine: a paid provider is called through the proxy
// (`Transport`), like a model (AGENTS.md rule 2). Results are untrusted text.

export interface SearchQuery {
  query: string;
  scope: ResearchScope;
  recency: "any" | "year" | "month" | "week";
  include: readonly string[];
  exclude: readonly string[];
  max: number;
  language: "auto" | "bg" | "en";
}
export interface SearchProvider {
  readonly name: string;
  readonly scopes: readonly ResearchScope[];
  /** USD per query (0 = free) */
  readonly usdPerQuery: number;
  search(q: SearchQuery, signal?: AbortSignal): Promise<Hit[]>;
}
/** GET a JSON (or XML) document from a fixed, configured endpoint — never a URL taken from a page */
export type Transport = (url: string, init?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal | undefined }) => Promise<{ status: number; text: string }>;

export const fetchTransport: Transport = async (url, init = {}) => {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { accept: "application/json", "user-agent": "MandatResearch/0.1 (+https://github.com/SimoSabev/AI-Harness-NOIT)", ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...init.headers },
    body: init.body === undefined ? null : JSON.stringify(init.body),
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
  return { status: res.status, text: await res.text() };
};

async function json(t: Transport, url: string, init?: Parameters<Transport>[1]): Promise<Record<string, unknown>> {
  const r = await t(url, init);
  if (r.status !== 200) throw new MandatError("E_RESEARCH_SEARCH", `search endpoint answered ${r.status}`);
  try {
    const j = JSON.parse(r.text) as unknown;
    return typeof j === "object" && j !== null ? (j as Record<string, unknown>) : {};
  } catch {
    throw new MandatError("E_RESEARCH_SEARCH", "search endpoint answered with no JSON");
  }
}
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null) : []);
const str = (x: unknown): string => (typeof x === "string" ? x : "");
const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const siteOps = (q: SearchQuery) => `${q.query}${q.include.length > 0 && q.include.length <= 3 ? ` ${q.include.map((d) => `site:${d}`).join(" OR ")}` : ""}${q.exclude.slice(0, 5).map((d) => ` -site:${d}`).join("")}`;
const RECENCY_DAYS = { any: null, year: 365, month: 31, week: 7 } as const;
const sinceIso = (q: SearchQuery, now = Date.now()) => (RECENCY_DAYS[q.recency] === null ? null : new Date(now - (RECENCY_DAYS[q.recency] as number) * 86_400_000).toISOString().slice(0, 10));

/** a self-hosted SearXNG (docker/searxng, D-396): metasearch over several engines, JSON output, no key */
export function searxng(o: { baseUrl: string; transport?: Transport }): SearchProvider {
  const t = o.transport ?? fetchTransport;
  return {
    name: "searxng",
    scopes: ["web", "papers", "code"],
    usdPerQuery: 0,
    async search(q, signal) {
      const cat = q.scope === "papers" ? "science" : q.scope === "code" ? "it" : "general";
      const range = q.recency === "any" ? "" : `&time_range=${q.recency}`;
      const lang = q.language === "auto" ? "all" : q.language;
      const url = `${o.baseUrl.replace(/\/+$/, "")}/search?format=json&q=${encodeURIComponent(siteOps(q))}&categories=${cat}&language=${lang}&safesearch=0${range}`;
      let j = await json(t, url, { signal });
      // every engine timed out (a cold start, a slow network): one more try before "no results"
      if (arr(j.results).length === 0 && Array.isArray(j.unresponsive_engines) && j.unresponsive_engines.length > 0) j = await json(t, url, { signal });
      return arr(j.results)
        .slice(0, q.max)
        .map((r) => ({ url: str(r.url), title: strip(str(r.title)), snippet: strip(str(r.content)), date: str(r.publishedDate) || null, provider: "searxng" }));
    },
  };
}

/** Wikipedia's search API (MediaWiki action=query&list=search) in the language of the question */
export function wikipedia(o: { transport?: Transport } = {}): SearchProvider {
  const t = o.transport ?? fetchTransport;
  return {
    name: "wikipedia",
    scopes: ["web"],
    usdPerQuery: 0,
    async search(q, signal) {
      const lang = q.language === "bg" ? "bg" : "en";
      const j = await json(t, `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${Math.min(q.max, 10)}&srsearch=${encodeURIComponent(q.query)}`, { signal });
      return arr((j.query as Record<string, unknown> | undefined)?.search).map((r) => ({
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(str(r.title).replace(/ /g, "_"))}`,
        title: str(r.title),
        snippet: strip(str(r.snippet)),
        date: str(r.timestamp).slice(0, 10) || null,
        provider: "wikipedia",
      }));
    },
  };
}

/** arXiv's export API (Atom); one request at a time, as its terms ask */
export function arxiv(o: { transport?: Transport } = {}): SearchProvider {
  const t = o.transport ?? fetchTransport;
  return {
    name: "arxiv",
    scopes: ["papers"],
    usdPerQuery: 0,
    async search(q, signal) {
      const r = await t(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q.query)}&start=0&max_results=${Math.min(q.max, 10)}&sortBy=relevance`, { signal, headers: { accept: "application/atom+xml" } });
      if (r.status !== 200) throw new MandatError("E_RESEARCH_SEARCH", `arxiv answered ${r.status}`);
      return [...r.text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
        const e = m[1] ?? "";
        const tag = (n: string) => strip(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(e)?.[1] ?? "");
        // the abstract page, not the PDF: arXiv's /abs has the text and links to HTML/PDF
        return { url: tag("id").replace(/^http:/, "https:"), title: tag("title"), snippet: tag("summary").slice(0, 600), date: tag("published").slice(0, 10) || null, provider: "arxiv" };
      });
    },
  };
}

/** Crossref works (DOI metadata) in the polite pool (mailto) */
export function crossref(o: { mailto: string; transport?: Transport }): SearchProvider {
  const t = o.transport ?? fetchTransport;
  return {
    name: "crossref",
    scopes: ["papers"],
    usdPerQuery: 0,
    async search(q, signal) {
      const since = sinceIso(q);
      const filter = since ? `&filter=from-pub-date:${since}` : "";
      const j = await json(t, `https://api.crossref.org/works?rows=${Math.min(q.max, 10)}&query=${encodeURIComponent(q.query)}${filter}&mailto=${encodeURIComponent(o.mailto)}`, { signal });
      return arr((j.message as Record<string, unknown> | undefined)?.items).map((w) => {
        const dp = (((w.issued as Record<string, unknown> | undefined)?.["date-parts"] as unknown[][] | undefined)?.[0] ?? []).filter((n): n is number => typeof n === "number");
        return {
          url: str(w.URL) || `https://doi.org/${str(w.DOI)}`,
          title: strip(str((w.title as unknown[] | undefined)?.[0])),
          snippet: strip(str(w.abstract)).slice(0, 600) || [str((w["container-title"] as unknown[] | undefined)?.[0]), str(w.publisher)].filter(Boolean).join(" · "),
          date: dp.length > 0 ? dp.map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, "0"))).join("-") : null,
          provider: "crossref",
        };
      });
    },
  };
}

/** GitHub repository search (code search needs a token; repositories do not) */
export function github(o: { transport?: Transport; token?: string } = {}): SearchProvider {
  const t = o.transport ?? fetchTransport;
  return {
    name: "github",
    scopes: ["code"],
    usdPerQuery: 0,
    async search(q, signal) {
      const j = await json(t, `https://api.github.com/search/repositories?per_page=${Math.min(q.max, 10)}&q=${encodeURIComponent(q.query)}`, {
        signal,
        headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) },
      });
      return arr(j.items).map((r) => ({ url: str(r.html_url), title: str(r.full_name), snippet: `${str(r.description)} ★${String(r.stargazers_count ?? 0)}`.trim(), date: str(r.pushed_at).slice(0, 10) || null, provider: "github" }));
    },
  };
}

/** Stack Exchange (Stack Overflow by default): questions with an accepted or high-scored answer */
export function stackexchange(o: { site?: string; transport?: Transport } = {}): SearchProvider {
  const t = o.transport ?? fetchTransport;
  return {
    name: "stackexchange",
    scopes: ["code", "docs"],
    usdPerQuery: 0,
    async search(q, signal) {
      const j = await json(t, `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&pagesize=${Math.min(q.max, 10)}&site=${o.site ?? "stackoverflow"}&q=${encodeURIComponent(q.query)}`, { signal });
      return arr(j.items).map((r) => ({ url: str(r.link), title: strip(str(r.title)), snippet: `score ${String(r.score ?? 0)}${r.is_answered === true ? " · answered" : ""}`, date: typeof r.last_activity_date === "number" ? new Date(r.last_activity_date * 1000).toISOString().slice(0, 10) : null, provider: "stackexchange" }));
    },
  };
}

/** Exa contents (the page text Exa fetched) as the last step of the fetch ladder, through the proxy */
export function exaExtractor(o: { transport?: Transport; baseUrl: string; token: string }): { name: string; extract: (url: string, signal?: AbortSignal) => Promise<{ finalUrl: string; title: string; text: string; published: string | null } | null> } {
  const t = o.transport ?? fetchTransport;
  return {
    name: "exa",
    async extract(url, signal) {
      const j = await json(t, `${o.baseUrl}/contents`, { method: "POST", signal, headers: { authorization: `Bearer ${o.token}` }, body: { urls: [url], text: { maxCharacters: 60_000 } } });
      const r = arr(j.results)[0];
      if (!r || str(r.text) === "") return null;
      return { finalUrl: str(r.url) || url, title: str(r.title), text: str(r.text), published: str(r.publishedDate).slice(0, 10) || null };
    },
  };
}

/** Exa (neural search with highlights), through the proxy (the key lives there) */
export function exa(o: { transport?: Transport; baseUrl: string; token: string }): SearchProvider {
  const t = o.transport ?? fetchTransport;
  return {
    name: "exa",
    scopes: ["web", "papers", "code", "docs"],
    usdPerQuery: 0.007,
    async search(q, signal) {
      const since = sinceIso(q);
      const j = await json(t, `${o.baseUrl}/search`, {
        method: "POST",
        signal,
        headers: { authorization: `Bearer ${o.token}` },
        body: {
          query: q.query,
          type: "auto",
          numResults: Math.min(q.max, 10),
          contents: { highlights: { numSentences: 3, highlightsPerUrl: 2, query: q.query } },
          ...(q.include.length > 0 ? { includeDomains: q.include } : {}),
          ...(q.exclude.length > 0 ? { excludeDomains: q.exclude } : {}),
          ...(since ? { startPublishedDate: `${since}T00:00:00.000Z` } : {}),
          ...(q.scope === "papers" ? { category: "research paper" } : {}),
        },
      });
      return arr(j.results).map((r) => ({
        url: str(r.url),
        title: str(r.title),
        snippet: (Array.isArray(r.highlights) ? r.highlights.map(String).join(" … ") : str(r.text)).slice(0, 1000),
        date: str(r.publishedDate).slice(0, 10) || null,
        provider: "exa",
      }));
    },
  };
}

/** the web search tool version a model supports (claude-api skill, 26.10.2026): the dynamic-filtering variant on
 * Sonnet/Opus 5.x and 4.6+, the basic one elsewhere (Haiku) */
export function webSearchToolType(model: string): "web_search_20260209" | "web_search_20250305" {
  return /^claude-(opus|sonnet)-(5|4-[678])/.test(model) ? "web_search_20260209" : "web_search_20250305";
}

/** Anthropic's web search server tool through the proxy (a cheap model runs one search; results carry page_age) */
export function anthropicWebSearch(o: { client: Anthropic; model: string }): SearchProvider {
  return {
    name: "anthropic-web-search",
    scopes: ["web", "docs"],
    usdPerQuery: 0.01,
    async search(q, signal) {
      const domains = q.include.length > 0 ? { allowed_domains: [...q.include] } : q.exclude.length > 0 ? { blocked_domains: [...q.exclude] } : {};
      let msg: Anthropic.Message;
      try {
        msg = await o.client.messages.create(
          {
            model: o.model,
            max_tokens: 2048,
            tools: [{ type: webSearchToolType(o.model), name: "web_search", max_uses: 1, ...domains }],
            messages: [{ role: "user", content: `Search the web once for: ${q.query}\nDo not answer; only search.` }],
          },
          signal ? { signal } : undefined,
        );
      } catch (e) {
        throw new MandatError("E_RESEARCH_SEARCH", e instanceof Anthropic.APIError ? `web search answered ${String(e.status)}` : "web search unreachable");
      }
      const out: Hit[] = [];
      for (const b of msg.content) {
        // an error result is an object, a success a list (server-tool errors do not raise)
        if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
        for (const r of b.content) out.push({ url: r.url, title: r.title, snippet: "", date: r.page_age ?? null, provider: "anthropic-web-search" });
      }
      return out.slice(0, q.max);
    },
  };
}
