import { depthBudget, frameUntrusted } from "@mandat/contract";
import type { ClaimVerdict, PlanLane, Quote, ReportClaim, ReportSource, ResearchReport, ResearchRequest, ResearchRequestInput, ResearchScope, TraceDraft, TraceEvent } from "@mandat/contract";
import { ResearchRequest as RequestSchema } from "@mandat/contract";
import { Budget } from "./budget.js";
import type { Attempt, Fetcher, Page } from "./fetch/fetcher.js";
import { claimAsOf, claimVerdict, lintSynthesis } from "./judge.js";
import type { ClaimEvidence } from "./judge.js";
import { RoleModels } from "./model.js";
import type { ModelClient } from "./model.js";
import { ANALYST_SYSTEM, PLANNER_SYSTEM, Plan, Queries, READER_SYSTEM, Reading, Reflection, SEARCHER_SYSTEM, VERIFIER_SYSTEM, Verified, WRITER_SYSTEM, Written } from "./prompts.js";
import { locateQuote } from "./quotes.js";
import { fuseHits } from "./rank.js";
import type { Hit } from "./rank.js";
import type { RoleRoute, RouterChannel } from "./router.js";
import type { SearchProvider } from "./search/providers.js";
import { Bm25, canonicalUrl, chunkText, nearDuplicate } from "./text.js";

// E9г (PRD 6.13, F10; docs/prd/research/research-strategies.md §7.1): the research run. A deterministic skeleton in
// code, models only in bounded roles: plan → lanes in parallel (queries → search on every provider of the scope →
// fusion → read through the fetch ladder → verbatim quotes, each checked as a substring → reflect and close gaps) →
// claims with verdicts from the quotes → one synthesis from the claims table → the citation linter. Every step is an
// event for the live panel; the report carries the whole trace.

export interface EngineDeps {
  id: string;
  routes: readonly RoleRoute[];
  clientOf: (c: RouterChannel) => ModelClient;
  providers: readonly SearchProvider[];
  fetcher: Fetcher;
  /** numbers and stamps an event and hands it to the panel and the database */
  emit: (e: TraceEvent) => void;
  signal?: AbortSignal;
  now?: () => number;
  /** parallel lanes and parallel page reads per lane */
  concurrency?: { lanes: number; pages: number };
}

interface Source extends ReportSource {
  text: string;
}
interface Finding {
  id: number;
  lane: string;
  quote: number;
  claim: string;
}

const MAX_CHARS_TO_READER = 14_000;
const PER_PAGE_QUOTES = 6;

async function pool<T>(items: readonly T[], n: number, f: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) await f(items[i++] as T);
  }));
}

export async function runResearch(input: ResearchRequestInput | ResearchRequest, d: EngineDeps): Promise<ResearchReport> {
  const req = RequestSchema.parse(input);
  const now = d.now ?? Date.now;
  const started = now();
  const cap = { ...depthBudget(req.depth), ...(req.budget_usd !== null ? { usd: req.budget_usd } : {}) };
  const budget = new Budget(cap, started + cap.minutes * 60_000, now);
  const trace: TraceEvent[] = [];
  let seq = 0;
  const emit = (e: TraceDraft) => {
    const full = { ...e, seq: seq++, at: new Date(now()).toISOString() } as TraceEvent;
    trace.push(full);
    d.emit(full);
  };
  d.signal?.addEventListener("abort", () => budget.stop("stopped"), { once: true });
  const models = new RoleModels(d.routes, d.clientOf, (c) => {
    if (c.reply) budget.spend(c.reply.usd, c.reply.inputTokens, c.reply.outputTokens);
    emit({
      kind: "model_call", lane: null, role: c.role, channel: c.channel.label.slice(0, 80), channel_kind: c.channel.kind, model: c.channel.model.slice(0, 80), purpose: c.purpose.slice(0, 120),
      input_tokens: c.reply?.inputTokens ?? 0, output_tokens: c.reply?.outputTokens ?? 0, usd: c.reply?.usd ?? 0, ms: Math.max(0, Math.round(c.ms)), ok: c.reply !== null,
    });
  }, now);
  const lang = req.language === "auto" ? "the language of the question" : req.language === "bg" ? "Bulgarian" : "English";
  const asOf = new Date(started).toISOString().slice(0, 10);
  emit({ kind: "run_started", lane: null, question: req.question, depth: req.depth, goal: req.goal, budget_usd: cap.usd, routing: models.assignments() });

  const sources: Source[] = [];
  const byCanonical = new Map<string, Source>();
  const quotes: Quote[] = [];
  const findings: Finding[] = [];
  const seenUrls = new Set<string>();
  const allQueries = new Set<string>();
  let results = 0;
  let fetched = 0;

  // 1 plan
  let strategy = "One lane: the question as asked.";
  let lanes: PlanLane[] = [{ id: "l1", title: req.question.slice(0, 160), question: req.question, scope: req.scopes[0] ?? "web", rationale: "" }];
  if (req.depth !== "quick") {
    try {
      const p = await models.json("planner", "plan", Plan, {
        system: PLANNER_SYSTEM,
        user: [`Question: ${req.question}`, `Today: ${asOf}`, `Allowed scopes: ${req.scopes.join(", ")}`, `At most ${cap.lanes} lanes.`, req.instructions ? `Instructions from the person: ${req.instructions}` : ""].filter(Boolean).join("\n"),
        maxTokens: 8000,
        effort: req.depth === "deep" ? "high" : "medium",
      }, d.signal);
      strategy = p.strategy || strategy;
      lanes = p.lanes.slice(0, cap.lanes).map((l, i) => ({ id: `l${i + 1}`, title: l.title, question: l.question, scope: req.scopes.includes(l.scope) ? l.scope : (req.scopes[0] ?? "web"), rationale: l.rationale }));
    } catch {
      emit({ kind: "note", lane: null, level: "warn", text: "the planner did not answer; one lane with the question as asked" });
    }
  }
  emit({ kind: "plan", lane: null, strategy, lanes });

  const providersFor = (scope: ResearchScope) => {
    const named = req.providers.length > 0 ? d.providers.filter((p) => req.providers.includes(p.name)) : d.providers;
    const fit = named.filter((p) => p.scopes.includes(scope));
    return fit.length > 0 ? fit : named.filter((p) => p.scopes.includes("web"));
  };
  const pagesPerRound = Math.max(2, Math.ceil(cap.pages / lanes.length / cap.rounds));

  const readPage = async (lane: PlanLane, url: string): Promise<number> => {
    if (!budget.canRead()) return 0;
    budget.page();
    const page = await d.fetcher.fetch(url, (a: Attempt) => {
      fetched++;
      emit({ kind: "fetch", lane: lane.id, url: a.url.slice(0, 2000), domain: a.domain.slice(0, 253), tier: a.tier, status: a.status, http_status: a.httpStatus, bytes: a.bytes, ms: Math.round(a.ms), source_id: null });
    }, d.signal);
    if (!page) return 0;
    const src = register(lane, page);
    if (!src) return 0;
    // the reader sees the passages that match the lane question best, in page order (BM25 over ~1200-char chunks)
    const chunks = chunkText(page.text, 1200, 120);
    const scores = new Bm25(chunks.map((c) => c.text)).scores(lane.question);
    const keep = new Set(chunks.map((_c, i) => i).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)).slice(0, Math.floor(MAX_CHARS_TO_READER / 1200)));
    const excerpt = chunks.filter((_c, i) => keep.has(i)).map((c) => c.text).join("\n…\n");
    let reading;
    try {
      reading = await models.json("reader", `read ${src.domain}`, Reading, {
        system: READER_SYSTEM,
        user: [`Sub-question: ${lane.question}`, `Page title: ${page.title}`, `Published: ${page.published ?? "unknown"}`, frameUntrusted({ author: src.domain, association: "none", source: "web_page", text: excerpt })].join("\n"),
        maxTokens: 6000,
        effort: "low",
      }, d.signal);
    } catch {
      emit({ kind: "read", lane: lane.id, source_id: src.id, url: src.final_url, quotes: 0, rejected: 0, relevant: false, note: "the reader did not answer" });
      return 0;
    }
    let ok = 0;
    let rejected = 0;
    for (const q of reading.quotes.slice(0, PER_PAGE_QUOTES)) {
      const at = locateQuote(q.quote, page.text);
      if (!at) {
        rejected++;
        continue;
      }
      quotes.push({ source_id: src.id, offset: at.offset, length: at.length, text: at.text.slice(0, 2000) });
      findings.push({ id: findings.length, lane: lane.id, quote: quotes.length - 1, claim: q.claim });
      ok++;
    }
    emit({ kind: "read", lane: lane.id, source_id: src.id, url: src.final_url.slice(0, 2000), quotes: ok, rejected, relevant: reading.relevant && ok > 0, note: reading.note.slice(0, 300) });
    return ok;
  };

  const register = (lane: PlanLane, page: Page): Source | null => {
    const key = canonicalUrl(page.finalUrl) ?? page.finalUrl;
    const dup = byCanonical.get(key) ?? sources.find((s) => s.content_hash === page.contentHash || (s.text.length < 200_000 && nearDuplicate(s.text, page.text)));
    if (dup) {
      emit({ kind: "note", lane: lane.id, level: "info", text: `${page.domain}: the same text as source [${dup.n}]` });
      return null;
    }
    const n = sources.length + 1;
    const src: Source = {
      n, id: `src_${n}`, provider: page.tier === "provider" ? "extract" : "fetch", url: page.url, final_url: page.finalUrl, title: page.title.slice(0, 300) || page.domain, domain: page.domain,
      content_hash: page.contentHash, fetched_at: new Date(now()).toISOString(), published: page.published, tier: page.tier, state: "read", lane: lane.id, text: page.text,
    };
    sources.push(src);
    byCanonical.set(key, src);
    return src;
  };

  const search = async (lane: PlanLane, qs: readonly string[]): Promise<Hit[][]> => {
    const lists: Hit[][] = [];
    for (const query of qs) {
      if (!budget.canQuery()) break;
      const key = query.trim().toLowerCase();
      if (allQueries.has(key)) continue;
      allQueries.add(key);
      budget.query();
      await Promise.all(providersFor(lane.scope).map(async (p) => {
        emit({ kind: "query", lane: lane.id, provider: p.name, query: query.slice(0, 500), scope: lane.scope });
        const t0 = now();
        try {
          const hits = await p.search({ query, scope: lane.scope, recency: req.recency, include: req.include_domains, exclude: req.exclude_domains, max: 8, language: req.language }, d.signal);
          budget.spend(p.usdPerQuery);
          results += hits.length;
          const fresh = hits.filter((h) => !seenUrls.has(canonicalUrl(h.url) ?? h.url));
          lists.push(hits);
          emit({
            kind: "results", lane: lane.id, provider: p.name, query: query.slice(0, 500), hits: hits.length, new_hits: fresh.length, ms: Math.max(0, now() - t0),
            top: hits.slice(0, 10).map((h) => ({ url: h.url.slice(0, 2000), title: h.title.slice(0, 300), domain: (canonicalUrl(h.url) ? new URL(canonicalUrl(h.url) as string).hostname : "").slice(0, 253) })),
          });
        } catch {
          emit({ kind: "note", lane: lane.id, level: "warn", text: `${p.name} did not answer for "${query.slice(0, 120)}"` });
        }
      }));
    }
    return lists;
  };

  const runLane = async (lane: PlanLane) => {
    let queries: string[] = [];
    try {
      queries = (await models.json("searcher", `queries ${lane.id}`, Queries, {
        system: SEARCHER_SYSTEM,
        user: [`Sub-question: ${lane.question}`, `Scope: ${lane.scope}`, `Today: ${asOf}`, req.instructions ? `Instructions: ${req.instructions}` : ""].filter(Boolean).join("\n"),
        maxTokens: 3000,
        effort: "low",
      }, d.signal)).queries;
    } catch {
      queries = [lane.question];
    }
    for (let round = 1; round <= cap.rounds; round++) {
      if (budget.exhausted()) break;
      const lists = await search(lane, queries.slice(0, 5));
      const picked = fuseHits(lists, { question: lane.question, include: req.include_domains, exclude: req.exclude_domains, seen: seenUrls, limit: pagesPerRound });
      for (const h of picked) seenUrls.add(h.canonical);
      let gained = 0;
      await pool(picked, d.concurrency?.pages ?? 3, async (h) => {
        gained += await readPage(lane, h.url);
      });
      emit({ kind: "budget", lane: lane.id, spent_usd: round6(budget.usd), cap_usd: cap.usd, pages: budget.pages, queries: budget.queries });
      if (round === cap.rounds || budget.exhausted()) break;
      const mine = findings.filter((f) => f.lane === lane.id);
      let r;
      try {
        r = await models.json("analyst", `reflect ${lane.id}`, Reflection, {
          system: ANALYST_SYSTEM,
          user: [
            `Sub-question: ${lane.question}`, `What done looks like: ${lane.rationale || "the sub-question is answered with sources"}`,
            `Queries run: ${[...allQueries].slice(-30).join(" | ")}`,
            `Facts found so far (${mine.length}):`, ...mine.slice(-40).map((f) => `- ${f.claim} [${sourceOf(f).domain}]`),
          ].join("\n"),
          maxTokens: 4000,
          effort: req.goal === "economy" ? "low" : "medium",
        }, d.signal);
      } catch {
        break;
      }
      const done = r.done || (gained === 0 && round > 1) || r.next_queries.length === 0;
      emit({ kind: "reflect", lane: lane.id, round, gaps: r.gaps.slice(0, 8), next_queries: r.next_queries.slice(0, 12), done, reason: (gained === 0 && round > 1 && !r.done ? "no new facts in this round" : r.reason).slice(0, 300) });
      if (done) break;
      queries = r.next_queries;
    }
  };
  const sourceOf = (f: Finding): Source => sources.find((s) => s.id === quotes[f.quote]?.source_id) as Source;

  await pool(lanes, d.concurrency?.lanes ?? 4, runLane);

  // 2 claims and verdicts
  const claims: ReportClaim[] = [];
  if (findings.length > 0) {
    let verified: { text: string; support: number[]; refute: number[] }[];
    const shown = findings.slice(0, 160);
    try {
      verified = (await models.json("verifier", "claims", Verified, {
        system: VERIFIER_SYSTEM,
        user: [`Question: ${req.question}`, "Findings:", ...shown.map((f) => `#${f.id} [${sourceOf(f).domain}, ${sourceOf(f).published ?? "no date"}] fact: ${f.claim}\n  quote: ${frameUntrusted({ author: sourceOf(f).domain, association: "none", source: "web_page", text: (quotes[f.quote]?.text ?? "").slice(0, 400) })}`)].join("\n"),
        maxTokens: 16_000,
        effort: req.goal === "quality" ? "high" : "medium",
      }, d.signal)).claims;
    } catch {
      emit({ kind: "note", lane: null, level: "warn", text: "the verifier did not answer; every finding stands as its own claim" });
      verified = findings.map((f) => ({ text: f.claim, support: [f.id], refute: [] }));
    }
    for (const v of verified) {
      const sup = [...new Set(v.support)].map((i) => findings[i]).filter((f): f is Finding => f !== undefined);
      const ref = [...new Set(v.refute)].map((i) => findings[i]).filter((f): f is Finding => f !== undefined && !v.support.includes(f.id));
      if (sup.length === 0 && ref.length === 0) continue;
      const ev: ClaimEvidence[] = [...sup.map((f) => ({ domain: sourceOf(f).domain, stance: "support" as const, published: sourceOf(f).published })), ...ref.map((f) => ({ domain: sourceOf(f).domain, stance: "refute" as const, published: sourceOf(f).published }))];
      const verdict: ClaimVerdict = sup.length === 0 ? "conflict" : claimVerdict(ev);
      const used = [...sup, ...ref];
      const c: ReportClaim = {
        id: `c${claims.length + 1}`, text: v.text.slice(0, 2000), verdict, quote_ids: used.map((f) => f.quote).slice(0, 50),
        source_ns: [...new Set(used.map((f) => sourceOf(f).n))].sort((a, b) => a - b).slice(0, 50), as_of: claimAsOf(ev), lane: sup[0]?.lane ?? ref[0]?.lane ?? "l1",
      };
      if (claims.length >= 500) break;
      claims.push(c);
      emit({ kind: "claim", lane: c.lane, claim_id: c.id, text: c.text.slice(0, 500), verdict: c.verdict, sources: c.source_ns.length });
    }
  }

  // 3 synthesis from the claims table, then the linter
  let summary = "";
  let sections: { title: string; body: string }[] = [];
  const unresolved: string[] = [];
  const known = new Set(sources.filter((s) => claims.some((c) => c.source_ns.includes(s.n))).map((s) => s.n));
  if (claims.length > 0) {
    const table = claims.map((c) => `- (${c.verdict}${c.as_of ? `, as of ${c.as_of}` : ""}) ${c.text} → sources ${c.source_ns.map((n) => `[${n}]`).join("")}`).join("\n");
    const srcList = sources.filter((s) => known.has(s.n)).map((s) => `[${s.n}] ${s.title} — ${s.domain}${s.published ? `, ${s.published}` : ""}`).join("\n");
    const write = async (extra: string) =>
      models.json("writer", extra ? "rewrite" : "report", Written, {
        system: WRITER_SYSTEM,
        user: [`Question: ${req.question}`, `Write in ${lang}. Today: ${asOf}.`, req.instructions ? `Instructions from the person: ${req.instructions}` : "", `Plan: ${strategy}`, "Checked claims:", table, "Sources:", srcList, extra].filter(Boolean).join("\n"),
        maxTokens: req.depth === "deep" ? 32_000 : 16_000,
        effort: req.depth === "quick" ? "medium" : "high",
      }, d.signal);
    try {
      let w = await write("");
      let lint = [w.summary, ...w.sections.map((s) => s.body)].flatMap((t) => lintSynthesis(t, known).uncited);
      if (lint.length > 0 && budget.reason === null) {
        try {
          w = await write(`Your previous draft had sentences with no citation. Cite them from the claims or move them to "unresolved":\n${lint.slice(0, 20).map((s) => `- ${s}`).join("\n")}`);
          lint = [w.summary, ...w.sections.map((s) => s.body)].flatMap((t) => lintSynthesis(t, known).uncited);
        } catch {
          // keep the first draft; the linter below strips what is still uncited
        }
      }
      const clean = (t: string) => {
        const r = lintSynthesis(t, known);
        let out = r.text;
        for (const s of r.uncited) {
          out = out.replace(s, "").replace(/[ \t]{2,}/g, " ");
          unresolved.push(`Без източник / no source: ${s}`.slice(0, 500));
        }
        return out.replace(/\n{3,}/g, "\n\n").trim();
      };
      summary = clean(w.summary);
      sections = w.sections.map((s) => ({ title: s.title, body: clean(s.body) })).filter((s) => s.body.length > 0);
      unresolved.unshift(...w.unresolved);
      for (const s of sections) emit({ kind: "section", lane: null, title: s.title.slice(0, 200), chars: s.body.length });
    } catch {
      emit({ kind: "note", lane: null, level: "warn", text: "the writer did not answer; the report lists the checked claims only" });
      summary = claims.slice(0, 5).map((c) => `${c.text} ${c.source_ns.map((n) => `[${n}]`).join("")}`).join(" ");
    }
  } else unresolved.push("Нищо не беше потвърдено с цитат / nothing could be backed by a quote.");
  for (const c of claims.filter((c) => c.verdict === "conflict")) unresolved.push(`Противоречие / conflict: ${c.text}`.slice(0, 500));

  const partial = budget.reason;
  const status = sources.length === 0 && claims.length === 0 ? (partial ? "partial" : "failed") : partial ? "partial" : "done";
  const stats = {
    queries: allQueries.size, results, pages_fetched: fetched, pages_read: sources.length, domains: new Set(sources.map((s) => s.domain)).size, quotes: quotes.length, claims: claims.length,
    input_tokens: budget.inputTokens, output_tokens: budget.outputTokens, usd: round6(budget.usd), ms: Math.max(0, now() - started),
  };
  emit({ kind: "run_finished", lane: null, status, partial, stats });
  return {
    version: 1, id: d.id, request: req, status, partial, started_at: new Date(started).toISOString(), finished_at: new Date(now()).toISOString(), routing: models.assignments(),
    plan: { strategy: strategy.slice(0, 1000), lanes }, sources: sources.map(({ text: _t, ...s }) => s), quotes, claims, summary: summary.slice(0, 4000), sections: sections.slice(0, 30),
    unresolved: unresolved.slice(0, 50).map((u) => u.slice(0, 500)), stats, trace: trace.slice(-20_000),
  };
}
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
