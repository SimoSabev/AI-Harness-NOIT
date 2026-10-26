import { normalizeForCitation } from "@mandat/core";

// E9г (AC-13.2/13.3): a quote counts only as an exact substring of the pinned source text after the citation
// normalization (packages/core/src/citations.ts). The stored quote is the ORIGINAL span with its offset, so anyone can
// re-check it against the text with the same hash.

const MIN_QUOTE = 12;

/** the normalized text and, for every normalized character, the index of the original character it came from */
function normalizedWithMap(src: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let space = true;
  for (let i = 0; i < src.length; ) {
    const cp = src.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const n = normalizeForCitation(ch === " " || /\s/.test(ch) ? " " : ch);
    const w = n === "" && /\s/.test(ch) ? " " : n;
    for (const c of w) {
      if (c === " ") {
        if (space) continue;
        space = true;
      } else space = false;
      norm += c;
      map.push(i);
    }
    i += ch.length;
  }
  return { norm, map };
}

export interface LocatedQuote {
  offset: number;
  length: number;
  text: string;
}
export function locateQuote(quote: string, source: string): LocatedQuote | null {
  const q = normalizeForCitation(quote).replace(/^(\.\.\.|…)\s*/, "").replace(/\s*(\.\.\.|…)$/, "");
  if (q.length < MIN_QUOTE) return null;
  const exact = source.indexOf(quote.trim());
  if (exact >= 0 && quote.trim().length >= MIN_QUOTE) return { offset: exact, length: quote.trim().length, text: quote.trim() };
  const { norm, map } = normalizedWithMap(source);
  const at = norm.indexOf(q);
  if (at < 0) return null;
  const start = map[at] ?? 0;
  const lastIdx = map[at + q.length - 1] ?? start;
  const lastCp = source.codePointAt(lastIdx) ?? 0;
  const end = lastIdx + String.fromCodePoint(lastCp).length;
  const text = source.slice(start, end);
  return { offset: start, length: text.length, text };
}
