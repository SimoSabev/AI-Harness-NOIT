// E8к (v5 т. 4.10): the RS spike — search providers over the golden set (fixtures/research/golden.json). Per provider:
// retrieval hits (a golden answer in the returned text), the share of snippets that are exact substrings of the returned
// page (core/citations.ts), median latency and the provider's own cost unit. Without a key a provider is SKIPPED and no
// request is made. Keys come from the environment, go only into the request header and never into the output.
// Request shapes: Tavily [V] (vendor skill references, docs/prd/research/research-tools.md, 22.10.2026); Exa and Brave [НП]
// (their public docs; checked live by the first run with a key).
import { citationInSource, goldenHit } from "@mandat/core";

export const PROVIDERS = ["tavily", "exa", "brave"];
const KEYS = { tavily: "TAVILY_API_KEY", exa: "EXA_API_KEY", brave: "BRAVE_API_KEY" };

/** one search → [{ text, snippet, page }] (page = the full text when the provider returns it, else null) + cost */
const ADAPTERS = {
  tavily: {
    request: (q, key) => ["https://api.tavily.com/search", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q, search_depth: "basic", max_results: 5, include_raw_content: "text", include_usage: true }) }],
    parse: (j) => ({ hits: (j.results ?? []).map((r) => ({ snippet: String(r.content ?? ""), page: typeof r.raw_content === "string" ? r.raw_content : null })), cost: { credits: Number(j.usage?.credits ?? 0) } }),
  },
  exa: {
    request: (q, key) => ["https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ query: q, numResults: 5, contents: { text: true, highlights: true } }) }],
    parse: (j) => ({ hits: (j.results ?? []).flatMap((r) => ((r.highlights ?? []).length > 0 ? r.highlights : [""]).map((h) => ({ snippet: String(h), page: typeof r.text === "string" ? r.text : null }))), cost: { usd: Number(j.costDollars?.total ?? 0) } }),
  },
  brave: {
    request: (q, key) => [`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`, { method: "GET", headers: { "X-Subscription-Token": key, Accept: "application/json" } }],
    parse: (j) => ({ hits: (j.web?.results ?? []).map((r) => ({ snippet: [r.description, ...(r.extra_snippets ?? [])].filter(Boolean).join(" "), page: null })), cost: { requests: 1 } }),
  },
};

const median = (xs) => (xs.length === 0 ? null : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);

export async function runRs({ env, golden, fetch, only = PROVIDERS, limit = golden.questions.length, now = () => Date.now() }) {
  /** @type {Record<string, Record<string, unknown>>} */
  const providers = {};
  const questions = golden.questions.slice(0, limit);
  for (const name of PROVIDERS) {
    const key = env[KEYS[name]];
    if (!only.includes(name) || typeof key !== "string" || key.length === 0) {
      providers[name] = { status: "SKIPPED", reason: only.includes(name) ? `no ${KEYS[name]}` : "not selected" };
      continue;
    }
    const a = ADAPTERS[name];
    const latencies = [];
    let hits = 0;
    let quoted = 0;
    let exact = 0;
    const cost = {};
    let error = null;
    for (const q of questions) {
      const t0 = now();
      let res;
      try {
        res = await fetch(...a.request(q.question, key));
      } catch {
        error = "network";
        break;
      }
      latencies.push(now() - t0);
      if (!res.ok) {
        error = `http_${res.status}`;
        break;
      }
      const parsed = a.parse(await res.json());
      for (const [k, v] of Object.entries(parsed.cost)) cost[k] = (cost[k] ?? 0) + (Number.isFinite(v) ? v : 0);
      if (goldenHit(parsed.hits.map((h) => `${h.snippet} ${h.page ?? ""}`).join(" "), q.answers)) hits++;
      for (const h of parsed.hits) {
        if (h.page === null || h.snippet.trim() === "") continue;
        quoted++;
        if (citationInSource(h.snippet, h.page)) exact++;
      }
    }
    providers[name] = error
      ? { status: "FAILED", error, questions: latencies.length }
      : { status: "OK", questions: questions.length, retrieval_hits: hits, substring_share: quoted === 0 ? null : exact / quoted, median_latency_ms: median(latencies), ...cost };
  }
  return { golden_questions: questions.length, providers };
}
