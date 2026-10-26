import { Bm25, canonicalUrl, domainOf } from "./text.js";
import { siteOf } from "./judge.js";

// E9г (PRD 6.13 step 2): hits of several providers and queries → one list. Reciprocal rank fusion (k = 60) over the
// lists, plus BM25 of title + snippet against the lane question (so a provider that returns off-topic pages does not
// win by rank alone), dedup by canonical URL, a cap per site so one site does not fill the reading list.

export interface Hit {
  url: string;
  title: string;
  snippet: string;
  date: string | null;
  provider: string;
}
export interface RankedHit extends Hit {
  canonical: string;
  domain: string;
  score: number;
  providers: string[];
}
export interface FuseOptions {
  question: string;
  include?: readonly string[];
  exclude?: readonly string[];
  /** canonical URLs already read or rejected in this run */
  seen?: ReadonlySet<string>;
  perSite?: number;
  limit?: number;
}

const matchesDomain = (domain: string, list: readonly string[]) => list.some((d) => domain === d || domain.endsWith(`.${d}`));

export function fuseHits(lists: readonly (readonly Hit[])[], o: FuseOptions): RankedHit[] {
  const by = new Map<string, RankedHit>();
  for (const list of lists) {
    list.forEach((h, i) => {
      const canonical = canonicalUrl(h.url);
      if (canonical === null || o.seen?.has(canonical)) return;
      const domain = domainOf(canonical);
      if (o.exclude && matchesDomain(domain, o.exclude)) return;
      if (o.include && o.include.length > 0 && !matchesDomain(domain, o.include)) return;
      const rrf = 1 / (60 + i + 1);
      const cur = by.get(canonical);
      if (cur) {
        cur.score += rrf;
        if (!cur.providers.includes(h.provider)) cur.providers.push(h.provider);
        if (cur.snippet.length < h.snippet.length) cur.snippet = h.snippet;
        cur.date ??= h.date;
      } else by.set(canonical, { ...h, canonical, domain, score: rrf, providers: [h.provider] });
    });
  }
  const all = [...by.values()];
  const bm = new Bm25(all.map((h) => `${h.title} ${h.snippet}`)).scores(o.question);
  const top = Math.max(1e-9, ...bm);
  // RRF of a first place is 1/61 ≈ 0.016; the text match adds up to the same amount, a second provider about as much
  all.forEach((h, i) => (h.score += ((bm[i] ?? 0) / top) * (1 / 61)));
  all.sort((a, b) => b.score - a.score || a.canonical.localeCompare(b.canonical));
  const per = new Map<string, number>();
  const out: RankedHit[] = [];
  for (const h of all) {
    const s = siteOf(h.domain);
    const n = per.get(s) ?? 0;
    if (n >= (o.perSite ?? 2)) continue;
    per.set(s, n + 1);
    out.push(h);
    if (out.length >= (o.limit ?? 20)) break;
  }
  return out;
}
