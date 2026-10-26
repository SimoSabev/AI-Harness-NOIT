import { MEMORY_BUDGET } from "@mandat/contract";
import type { MemoryItem } from "@mandat/contract";
import { line } from "./core.js";
import { entitiesOf, estimateTokens, terms } from "./text.js";

// D-400: recall — what memory brings when it is asked (a search, or the slice for a task). Three ranked lists fused
// with Reciprocal Rank Fusion: words (BM25 over stemmed terms), entities (paths, tools, `code`), and use/recency as a
// tie-breaker only. A memory with no word and no entity in common is never returned: abstaining beats the nearest guess.

export type Why = "words" | "entities" | "used";
export interface Hit { item: MemoryItem; score: number; why: Why[] }
export interface RecallOptions {
  repoId: string | null;
  limit?: number;
  /** tokens for all hits together */
  budget?: number;
  now?: Date;
}

const RRF_K = 60;
const DAY = 86_400_000;

/** The memories a search may see: active, the person's own (user), this session's notes and this project's. */
export function visible(items: readonly MemoryItem[], repoId: string | null): MemoryItem[] {
  return items.filter((m) => m.status === "active" && (m.scope === "user" || m.scope === "session" || (repoId !== null && m.scope === "project" && m.repo_id === repoId)));
}

function bm25(docs: readonly string[][], query: readonly string[]): number[] {
  const n = docs.length;
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, n);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  return docs.map((d) => {
    let s = 0;
    for (const q of query) {
      const f = d.filter((t) => t === q).length;
      if (f === 0) continue;
      const idf = Math.log(1 + (n - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
      s += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.length / Math.max(1, avg)))));
    }
    return s;
  });
}

const ranks = (scores: number[]): Map<number, number> => {
  const order = scores.map((s, i) => [s, i] as const).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return new Map(order.map(([, i], r) => [i, r + 1]));
};

export function searchMemory(items: readonly MemoryItem[], query: string, o: RecallOptions): Hit[] {
  const pool = visible(items, o.repoId);
  const q = terms(query);
  const qe = new Set([...entitiesOf(query), ...q]);
  const words = ranks(bm25(pool.map((m) => terms(m.text)), q));
  const ents = ranks(pool.map((m) => m.entities.filter((e) => qe.has(e) || terms(e).some((t) => qe.has(t))).length));
  const now = (o.now ?? new Date()).getTime();
  const used = ranks(pool.map((m) => (m.pinned ? 2 : 0) + Math.log1p(m.uses) + (m.last_used_at ? Math.max(0, 1 - (now - Date.parse(m.last_used_at)) / (90 * DAY)) : 0)));
  const hits: Hit[] = [];
  pool.forEach((item, i) => {
    const w = words.get(i);
    const e = ents.get(i);
    if (w === undefined && e === undefined) return;
    const u = used.get(i);
    const parts: [Why, number | undefined, number][] = [["words", w, 1], ["entities", e, 1], ["used", u, 0.5]];
    const why = parts.filter(([, r]) => r !== undefined).map(([k]) => k);
    const score = parts.reduce((s, [, r, weight]) => (r === undefined ? s : s + weight / (RRF_K + r)), 0);
    hits.push({ item, score, why });
  });
  hits.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const out: Hit[] = [];
  let tokens = 0;
  for (const h of hits) {
    if (out.length >= (o.limit ?? 8)) break;
    const t = estimateTokens(line(h.item));
    if (tokens + t > (o.budget ?? MEMORY_BUDGET.recall)) continue;
    tokens += t;
    out.push(h);
  }
  return out;
}
