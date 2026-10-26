import { createHash } from "node:crypto";
import { frameUntrusted } from "@mandat/contract";
import type { ClaimVerdict, ResearchReport, ResearchScope, SearchHit } from "@mandat/contract";
import { Bm25, canonicalUrl, chunkText, claimVerdict, domainOf, fuseHits, locateQuote } from "@mandat/research";
import type { Fetcher, Page, SearchProvider } from "@mandat/research";

// E9г (D-412): what the research_* tools do. A session remembers every URL that came out of a tool result: research_read
// and research_verify accept only those (AC-13.3: a URL the agent made up is refused with a reason). Page text goes back
// framed as untrusted. research_ask queues the full run (the worker) and waits a while; research_recall reads finished
// runs of the project.

export interface QueueSide {
  /** queue a research run; returns its id */
  enqueue(i: { question: string; depth: "quick" | "standard" | "deep"; budget_usd: number | null; repo: string | null }): Promise<string>;
  /** the run's state and, when finished, its report */
  poll(id: string): Promise<{ status: string; report: ResearchReport | null; error: string | null } | null>;
  /** finished runs whose question matches, newest first */
  recall(i: { question?: string; topic?: string; repo: string }): Promise<{ id: string; question: string; finished_at: string; report: ResearchReport }[]>;
}
export interface BackendDeps {
  providers: readonly SearchProvider[];
  fetcher: Fetcher;
  queue: QueueSide | null;
  /** how long research_ask waits before it returns the job id, ms */
  askWaitMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const sourceId = (url: string) => `src_${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
const MAX_TEXT = 24_000;

export class ResearchBackend {
  private readonly known = new Map<string, { url: string; title: string }>();
  private readonly pages = new Map<string, Page>();
  constructor(private readonly d: BackendDeps) {}

  private remember(url: string, title: string): string {
    const id = sourceId(canonicalUrl(url) ?? url);
    if (!this.known.has(id)) this.known.set(id, { url, title });
    return id;
  }
  /** a URL is usable only if a tool result produced it in this session */
  private resolve(x: { source_id?: string | undefined; url?: string | undefined }): { ok: true; id: string; url: string } | { ok: false; why: string } {
    if (x.source_id) {
      const k = this.known.get(x.source_id);
      return k ? { ok: true, id: x.source_id, url: k.url } : { ok: false, why: `unknown source_id ${x.source_id}: use an id from research_search` };
    }
    const id = sourceId(canonicalUrl(x.url ?? "") ?? x.url ?? "");
    const k = this.known.get(id);
    return k ? { ok: true, id, url: k.url } : { ok: false, why: "this URL did not come from a research tool result; search first (a URL from memory is not a source)" };
  }

  async search(i: { query: string; scope: ResearchScope; recency: "any" | "year" | "month" | "week"; domains?: string[] | undefined; max: number }, signal?: AbortSignal): Promise<SearchHit[]> {
    const ps = this.d.providers.filter((p) => p.scopes.includes(i.scope));
    const lists = await Promise.all((ps.length > 0 ? ps : this.d.providers).map((p) => p.search({ query: i.query, scope: i.scope, recency: i.recency, include: i.domains ?? [], exclude: [], max: Math.max(i.max, 8), language: "auto" }, signal).catch(() => [])));
    return fuseHits(lists, { question: i.query, include: i.domains ?? [], limit: i.max }).map((h) => ({
      source_id: this.remember(h.url, h.title),
      url: h.url.slice(0, 2000),
      title: h.title.slice(0, 300),
      snippet: h.snippet.slice(0, 1000),
      date: h.date?.slice(0, 40) ?? null,
      provider: h.providers.join("+").slice(0, 64),
    }));
  }

  private async page(id: string, url: string, signal?: AbortSignal): Promise<Page | null> {
    const cached = this.pages.get(id);
    if (cached) return cached;
    const p = await this.d.fetcher.fetch(url, () => undefined, signal);
    if (p) this.pages.set(id, p);
    return p;
  }

  async read(i: { source_id?: string | undefined; url?: string | undefined; question?: string | undefined }, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const r = this.resolve(i);
    if (!r.ok) return { error: r.why };
    const p = await this.page(r.id, r.url, signal);
    if (!p) return { error: "the page could not be read (blocked, robots.txt, or down); try another source", source_id: r.id };
    let text = p.text;
    if (i.question && text.length > MAX_TEXT) {
      const chunks = chunkText(text, 1200, 120);
      const s = new Bm25(chunks.map((c) => c.text)).scores(i.question);
      const keep = new Set(chunks.map((_c, k) => k).sort((a, b) => (s[b] ?? 0) - (s[a] ?? 0)).slice(0, Math.floor(MAX_TEXT / 1200)));
      text = chunks.filter((_c, k) => keep.has(k)).map((c) => c.text).join("\n…\n");
    }
    return {
      source_id: r.id, url: r.url, final_url: p.finalUrl, title: p.title, published: p.published, tier: p.tier, content_hash: p.contentHash,
      text: frameUntrusted({ author: p.domain, association: "none", source: "web_page", text: text.slice(0, MAX_TEXT) }),
      truncated: p.text.length > MAX_TEXT,
    };
  }

  async verify(i: { claims: { text: string; source_ids: string[]; urls: string[]; quote?: string | undefined }[] }, signal?: AbortSignal): Promise<{ text: string; verdict: ClaimVerdict; sources: { source_id: string; domain: string; found: boolean; quote: string | null }[]; note: string }[]> {
    const out = [];
    for (const c of i.claims) {
      const refs = [...c.source_ids.map((s) => this.resolve({ source_id: s })), ...c.urls.map((u) => this.resolve({ url: u }))];
      const bad = refs.filter((r) => !r.ok);
      const good = refs.filter((r): r is { ok: true; id: string; url: string } => r.ok);
      const sources: { source_id: string; domain: string; found: boolean; quote: string | null }[] = [];
      for (const r of good) {
        const p = await this.page(r.id, r.url, signal);
        const at = p && c.quote ? locateQuote(c.quote, p.text) : null;
        sources.push({ source_id: r.id, domain: domainOf(p?.finalUrl ?? r.url), found: at !== null, quote: at?.text ?? null });
      }
      let verdict: ClaimVerdict;
      let note: string;
      if (!c.quote) {
        verdict = "unchecked";
        note = "no quote given: pass the exact sentence from the source as `quote` to check it";
      } else if (sources.some((s) => s.found)) {
        verdict = claimVerdict(sources.filter((s) => s.found).map((s) => ({ domain: s.domain, stance: "support" as const, published: null })));
        note = verdict === "confirmed" ? "the quote is in two independent sources" : "the quote is in one site only";
      } else {
        verdict = "quote_missing";
        note = "the sources do not contain this quote";
      }
      if (bad.length > 0) note += `; ${bad.length} reference(s) refused: ${bad.map((b) => (b.ok ? "" : b.why)).join("; ")}`;
      out.push({ text: c.text, verdict, sources, note });
    }
    return out;
  }

  async ask(i: { question: string; depth: "quick" | "standard" | "deep"; budget_usd?: number | undefined; repo?: string | undefined }): Promise<Record<string, unknown>> {
    if (!this.d.queue) return { error: "research_ask needs the harness worker (pnpm local); use research_search and research_read meanwhile" };
    const id = await this.d.queue.enqueue({ question: i.question, depth: i.depth, budget_usd: i.budget_usd ?? null, repo: i.repo ?? null });
    const now = this.d.now ?? Date.now;
    const sleep = this.d.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const until = now() + (this.d.askWaitMs ?? 240_000);
    for (;;) {
      const s = await this.d.queue.poll(id);
      if (s?.report) return { job_id: id, ...summarize(s.report) };
      if (s?.status === "failed") return { job_id: id, status: "failed", error: s.error };
      if (now() >= until) return { job_id: id, status: s?.status ?? "queued", note: "still running: call research_recall with the same question later" };
      await sleep(2000);
    }
  }

  async recall(i: { question?: string | undefined; topic?: string | undefined; repo: string }): Promise<Record<string, unknown>> {
    if (!this.d.queue) return { error: "research_recall needs the harness database (pnpm local)" };
    const rows = await this.d.queue.recall({ ...(i.question ? { question: i.question } : {}), ...(i.topic ? { topic: i.topic } : {}), repo: i.repo });
    return { results: rows.slice(0, 5).map((r) => ({ job_id: r.id, as_of: r.finished_at, ...summarize(r.report) })) };
  }
}

/** what an agent gets back from a finished run: the answer, the claims with verdicts and their source numbers, sources */
export function summarize(r: ResearchReport): Record<string, unknown> {
  for (const s of r.sources) void s;
  return {
    status: r.status,
    partial: r.partial,
    answer: r.summary,
    sections: r.sections,
    claims: r.claims.map((c) => ({ text: c.text, verdict: c.verdict, sources: c.source_ns, as_of: c.as_of })),
    sources: r.sources.map((s) => ({ n: s.n, title: s.title, url: s.final_url, domain: s.domain, published: s.published, content_hash: s.content_hash })),
    unresolved: r.unresolved,
    cost_usd: r.stats.usd,
  };
}
