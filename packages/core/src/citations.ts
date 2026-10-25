// E8к (v5 т. 4.10 (3)): a citation is trusted only when its quote is a substring of the source after normalization.
// Pure functions (no I/O); E9г's verifier uses the same rules.

const INVISIBLE = /[\u00ad\u200b-\u200f\u2060\ufeff]/g;
const QUOTES: [RegExp, string][] = [[/[\u2018\u2019\u201a\u201b\u2032]/g, "'"], [/[\u201c\u201d\u201e\u201f\u2033]/g, '"'], [/[\u2010-\u2015\u2212]/g, "-"]];

/** NFKC, lower case, curly quotes and dashes → ASCII, invisible characters out, whitespace collapsed */
export function normalizeForCitation(s: string): string {
  let t = s.normalize("NFKC").replace(INVISIBLE, "");
  for (const [re, to] of QUOTES) t = t.replace(re, to);
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

/** a quote with an ellipsis at either end (a provider's truncation) counts by its inner text; an empty quote never counts */
export function citationInSource(quote: string, source: string): boolean {
  const q = normalizeForCitation(quote).replace(/^(\.\.\.|…)\s*/, "").replace(/\s*(\.\.\.|…)$/, "");
  return q.length > 0 && normalizeForCitation(source).includes(q);
}

/** the share of quotes that are exact substrings of their source; null without quotes */
export function substringShare(pairs: { quote: string; source: string }[]): number | null {
  if (pairs.length === 0) return null;
  return pairs.filter((p) => citationInSource(p.quote, p.source)).length / pairs.length;
}

/** a golden answer is hit when the reply contains one of the accepted answers after normalization (`=` and space are the same) */
export function goldenHit(reply: string, accepted: string[]): boolean {
  const r = normalizeForCitation(reply).replace(/=/g, " ");
  return accepted.some((a) => r.includes(normalizeForCitation(a).replace(/=/g, " ")));
}
