import type { MemoryItem } from "@mandat/contract";
import { normalizeKey, similarity } from "./text.js";

// D-392: memory gets better without an LLM rewriting it. Update on write (a newer fact about the same thing makes the
// older one invalid, never deleted — Graphiti; arXiv 2609.05441), duplicates merge, and long-unused memories are only
// suggested for the archive: the person decides.

/** Categories with one value at a time; a memory that names exactly one value of a category states that value. */
const CATEGORIES: readonly (readonly (readonly string[])[])[] = [
  [["npm"], ["pnpm"], ["yarn"], ["bun"]],
  [["vitest"], ["jest"], ["mocha"]],
  [["български", "bulgarian", "българск"], ["английски", "english", "английск"]],
];
const DUP_SIMILARITY = 0.8;
const STALE_DAYS = 60;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

/** For each category: the one value a text names, or null (none or more than one). */
function values(text: string): (number | null)[] {
  const w = words(text);
  const has = (alias: string) => [...w].some((x) => x === alias || (alias.length > 6 && x.startsWith(alias)));
  return CATEGORIES.map((cat) => {
    const named = cat.flatMap((aliases, i) => (aliases.some(has) ? [i] : []));
    return named.length === 1 ? (named[0] ?? null) : null;
  });
}

const sameShelf = (a: MemoryItem, b: MemoryItem) => a.scope === b.scope && a.repo_id === b.repo_id;

/** The active memories a new one makes invalid (same scope and project, one value each of a category, different). */
export function conflictsWith(fresh: MemoryItem, existing: readonly MemoryItem[]): string[] {
  const v = values(fresh.text);
  return existing
    .filter((m) => m.id !== fresh.id && m.status === "active" && sameShelf(m, fresh))
    .filter((m) => values(m.text).some((x, i) => x !== null && v[i] !== null && x !== v[i]))
    .map((m) => m.id);
}

export interface ConsolidationPlan {
  duplicates: { keep: string; drop: string }[];
  supersede: { old: string; by: string }[];
  /** suggestions only: unused for STALE_DAYS, not pinned */
  stale: string[];
}

const better = (a: MemoryItem, b: MemoryItem): boolean =>
  a.pinned !== b.pinned ? a.pinned : a.uses !== b.uses ? a.uses > b.uses : a.created_at !== b.created_at ? a.created_at < b.created_at : a.id < b.id;

export function consolidationPlan(items: readonly MemoryItem[], now: Date): ConsolidationPlan {
  const active = items.filter((m) => m.status === "active").sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const dropped = new Set<string>();
  const duplicates: ConsolidationPlan["duplicates"] = [];
  for (const a of active) {
    if (dropped.has(a.id)) continue;
    for (const b of active) {
      if (b.id === a.id || dropped.has(b.id) || dropped.has(a.id) || !sameShelf(a, b)) continue;
      if (normalizeKey(a.text) !== normalizeKey(b.text) && similarity(a.text, b.text) < DUP_SIMILARITY) continue;
      const [keep, drop] = better(a, b) ? [a, b] : [b, a];
      dropped.add(drop.id);
      duplicates.push({ keep: keep.id, drop: drop.id });
    }
  }
  const supersede: ConsolidationPlan["supersede"] = [];
  const live = active.filter((m) => !dropped.has(m.id));
  for (const m of [...live].reverse()) {
    const older = live.filter((x) => x.created_at < m.created_at || (x.created_at === m.created_at && x.id < m.id));
    for (const old of conflictsWith(m, older)) if (!supersede.some((s) => s.old === old)) supersede.push({ old, by: m.id });
  }
  const cutoff = now.getTime() - STALE_DAYS * 86_400_000;
  const stale = live
    .filter((m) => !m.pinned && !supersede.some((s) => s.old === m.id) && Date.parse(m.created_at) < cutoff && (m.last_used_at === null || Date.parse(m.last_used_at) < cutoff))
    .map((m) => m.id);
  return { duplicates, supersede, stale };
}
