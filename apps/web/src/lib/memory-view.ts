import type { MemoryItem } from "@mandat/contract";
import { searchMemory } from "@mandat/memory";

// D-400: what the memory page shows — from the address (view, filter, search, the open memory), pure.

export const MEMORY_FILTERS = ["all", "mine", "project", "pending", "archive"] as const;
export type MemoryFilter = (typeof MEMORY_FILTERS)[number];
/** `at`: round 2 — a day (YYYY-MM-DD) the memory is shown as of; absent = today */
/** D-599: list, the 2D map (graph), 3D threads, a timeline per kind, clusters per kind */
export const MEMORY_VIEWS = ["list", "graph", "threads", "time", "clusters"] as const;
export type MemoryViewId = (typeof MEMORY_VIEWS)[number];
export interface MemoryQuery { view: MemoryViewId; filter: MemoryFilter; q: string; id: string | null; at?: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export function parseMemoryQuery(sp: Record<string, string | string[] | undefined>): MemoryQuery {
  const f = one(sp.f);
  const id = one(sp.id);
  const at = one(sp.at);
  // a real calendar day only (2026-13-40 parses to nothing or to another day)
  const t = at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? Date.parse(`${at}T00:00:00.000Z`) : Number.NaN;
  const day = at && Number.isFinite(t) && new Date(t).toISOString().startsWith(at) ? at : null;
  return {
    ...(day ? { at: day } : {}),
    view: (MEMORY_VIEWS as readonly string[]).includes(one(sp.view) ?? "") ? (one(sp.view) as MemoryViewId) : "list",
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
  if (n.at) p.set("at", n.at);
  const s = p.toString();
  return s ? `/memory?${s}` : "/memory";
}
