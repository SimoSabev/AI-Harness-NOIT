import type { MemoryItem } from "@mandat/contract";
import { searchMemory } from "@mandat/memory";

// D-392: what the memory page shows — from the address (view, filter, search, the open memory), pure.

export const MEMORY_FILTERS = ["all", "mine", "project", "pending", "archive"] as const;
export type MemoryFilter = (typeof MEMORY_FILTERS)[number];
export interface MemoryQuery { view: "list" | "graph"; filter: MemoryFilter; q: string; id: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export function parseMemoryQuery(sp: Record<string, string | string[] | undefined>): MemoryQuery {
  const f = one(sp.f);
  const id = one(sp.id);
  return {
    view: one(sp.view) === "graph" ? "graph" : "list",
    filter: (MEMORY_FILTERS as readonly string[]).includes(f ?? "") ? (f as MemoryFilter) : "all",
    q: (one(sp.q) ?? "").trim().slice(0, 200),
    id: id && UUID.test(id) ? id : null,
  };
}

const FILTER: Record<MemoryFilter, (m: MemoryItem) => boolean> = {
  all: (m) => m.status === "active" || m.status === "pending",
  mine: (m) => m.scope === "user" && (m.status === "active" || m.status === "pending"),
  project: (m) => m.scope === "project" && (m.status === "active" || m.status === "pending"),
  pending: (m) => m.status === "pending",
  archive: (m) => m.status === "archived" || m.status === "invalid",
};

/** The memories of a filter; with a search, the matches in the order of the memory's own recall. */
export function visibleMemories(items: readonly MemoryItem[], q: MemoryQuery): MemoryItem[] {
  const pool = items.filter(FILTER[q.filter]);
  if (!q.q) return pool;
  // the page searches everything the person sees, whatever its status or project (the recall itself sees only active)
  const asActive = pool.map((m) => ({ ...m, status: "active" as const, scope: "user" as const, repo_id: null }));
  const hits = searchMemory(asActive, q.q, { repoId: null, limit: 20, budget: Number.MAX_SAFE_INTEGER });
  const byId = new Map(pool.map((m) => [m.id, m]));
  return hits.flatMap((h) => byId.get(h.item.id) ?? []);
}

export function memoryHref(q: MemoryQuery, change: Partial<MemoryQuery>): string {
  const n = { ...q, ...change };
  const p = new URLSearchParams();
  if (n.view !== "list") p.set("view", n.view);
  if (n.filter !== "all") p.set("f", n.filter);
  if (n.q) p.set("q", n.q);
  if (n.id) p.set("id", n.id);
  const s = p.toString();
  return s ? `/memory?${s}` : "/memory";
}
