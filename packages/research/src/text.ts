// E9г: text helpers of the research engine — canonical URLs, tokens, chunks with offsets, BM25, near duplicates.
// Pure functions.

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_[a-z]+|igshid|ref_src|_hsenc|_hsmi|yclid)$/i;

/** http(s) only; lower-case host without www., no fragment, no tracking params, sorted query, no trailing slash (except root) */
export function canonicalUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));
  u.search = keep.length > 0 ? `?${new URLSearchParams(keep).toString()}` : "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const STOP = new Set(["the", "a", "an", "of", "and", "or", "to", "in", "on", "is", "are", "was", "be", "for", "by", "with", "what", "how", "и", "в", "на", "е", "за", "от", "с", "да", "по", "че", "ли"]);
export function tokenize(s: string): string[] {
  return (s.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
}

export interface Chunk {
  offset: number;
  text: string;
}
/** windows of ≤ size characters that end at a paragraph, sentence or space when one is in the last third */
export function chunkText(text: string, size = 1200, overlap = 150): Chunk[] {
  const out: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const win = text.slice(start, end);
      const floor = Math.floor(size * 0.66);
      const cut = [win.lastIndexOf("\n\n"), win.lastIndexOf(". "), win.lastIndexOf("\n"), win.lastIndexOf(" ")].find((i) => i >= floor);
      if (cut !== undefined) end = start + cut + (win[cut] === "." ? 1 : 0);
    }
    const piece = text.slice(start, end);
    const lead = piece.length - piece.trimStart().length;
    const t = piece.trim();
    if (t.length > 0) out.push({ offset: start + lead, text: t });
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

/** Okapi BM25 over a fixed set of documents (k1 1.2, b 0.75) */
export class Bm25 {
  private readonly docs: Map<string, number>[];
  private readonly lens: number[];
  private readonly df = new Map<string, number>();
  private readonly avg: number;
  constructor(texts: string[]) {
    this.docs = texts.map((t) => {
      const m = new Map<string, number>();
      for (const w of tokenize(t)) m.set(w, (m.get(w) ?? 0) + 1);
      return m;
    });
    this.lens = this.docs.map((d) => [...d.values()].reduce((a, b) => a + b, 0));
    for (const d of this.docs) for (const w of d.keys()) this.df.set(w, (this.df.get(w) ?? 0) + 1);
    this.avg = this.lens.reduce((a, b) => a + b, 0) / Math.max(1, this.lens.length);
  }
  scores(query: string): number[] {
    const q = [...new Set(tokenize(query))];
    const n = this.docs.length;
    return this.docs.map((d, i) => {
      let s = 0;
      for (const w of q) {
        const f = d.get(w) ?? 0;
        if (f === 0) continue;
        const df = this.df.get(w) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        s += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * (this.lens[i] ?? 0)) / (this.avg || 1)));
      }
      return s;
    });
  }
}

function shingles(s: string): Set<string> {
  const w = tokenize(s);
  const out = new Set<string>();
  for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(" "));
  return out;
}
/** Jaccard of 4-word shingles ≥ 0.8 */
export function nearDuplicate(a: string, b: string): boolean {
  const x = shingles(a);
  const y = shingles(b);
  if (x.size === 0 || y.size === 0) return false;
  let both = 0;
  for (const s of x) if (y.has(s)) both++;
  return both / (x.size + y.size - both) >= 0.8;
}
