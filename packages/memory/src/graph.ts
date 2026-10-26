import type { MemoryItem } from "@mandat/contract";

// D-392: the "Links" view of the memory menu. Nodes: you, each project, each memory, and every entity two or more
// memories share; edges: scope (memory → you/project), about (memory → entity), superseded (old → new). The layout is a
// seeded force layout (Fruchterman–Reingold), so the same memory always draws the same picture — no new dependency.

export type NodeType = "root" | "memory" | "entity";
export interface GraphNode { id: string; type: NodeType; label: string; x: number; y: number; status?: MemoryItem["status"]; kind?: MemoryItem["kind"] }
export interface GraphEdge { from: string; to: string; kind: "scope" | "about" | "superseded" }
export interface MemoryGraph { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number }

const W = 1000;
const H = 700;
const PAD = 40;

/** A small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layout(nodes: GraphNode[], edges: GraphEdge[]): void {
  const n = nodes.length;
  const idx = new Map(nodes.map((x, i) => [x.id, i]));
  const r = rng(42 + n);
  const pos = nodes.map((_, i) => (i === 0 ? { x: W / 2, y: H / 2 } : { x: PAD + r() * (W - 2 * PAD), y: PAD + r() * (H - 2 * PAD) }));
  const k = Math.sqrt(((W - 2 * PAD) * (H - 2 * PAD)) / Math.max(1, n)) * 0.75;
  let temp = W / 8;
  for (let it = 0; it < 220; it++) {
    const d = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const pi = pos[i]!, pj = pos[j]!;
        let dx = pi.x - pj.x, dy = pi.y - pj.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = 0.01 * (i - j);
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }
        const f = (k * k) / dist;
        d[i]!.x += (dx / dist) * f; d[i]!.y += (dy / dist) * f;
        d[j]!.x -= (dx / dist) * f; d[j]!.y -= (dy / dist) * f;
      }
    for (const e of edges) {
      const i = idx.get(e.from), j = idx.get(e.to);
      if (i === undefined || j === undefined) continue;
      const pi = pos[i]!, pj = pos[j]!;
      const dx = pi.x - pj.x, dy = pi.y - pj.y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const f = (dist * dist) / k;
      d[i]!.x -= (dx / dist) * f; d[i]!.y -= (dy / dist) * f;
      d[j]!.x += (dx / dist) * f; d[j]!.y += (dy / dist) * f;
    }
    for (let i = 1; i < n; i++) {
      const p = pos[i]!, v = d[i]!;
      const len = Math.max(0.01, Math.hypot(v.x, v.y));
      p.x = Math.min(W - PAD, Math.max(PAD, p.x + (v.x / len) * Math.min(len, temp)));
      p.y = Math.min(H - PAD, Math.max(PAD, p.y + (v.y / len) * Math.min(len, temp)));
    }
    temp = Math.max(1, temp * 0.97);
  }
  nodes.forEach((x, i) => {
    x.x = Math.round(pos[i]!.x);
    x.y = Math.round(pos[i]!.y);
  });
}

/** The graph of the given memories; `repos` names the projects (id → name). */
export function memoryGraph(items: readonly MemoryItem[], repos: Readonly<Record<string, string>>): MemoryGraph {
  const nodes: GraphNode[] = [{ id: "you", type: "root", label: "you", x: 0, y: 0 }];
  const edges: GraphEdge[] = [];
  const repoIds = [...new Set(items.flatMap((m) => (m.scope === "project" && m.repo_id ? [m.repo_id] : [])))].sort();
  for (const r of repoIds) nodes.push({ id: `repo:${r}`, type: "root", label: repos[r] ?? r.slice(0, 8), x: 0, y: 0 });
  const ids = new Set(items.map((m) => m.id));
  for (const m of items) {
    nodes.push({ id: m.id, type: "memory", label: m.text, status: m.status, kind: m.kind, x: 0, y: 0 });
    edges.push({ from: m.id, to: m.scope === "project" && m.repo_id ? `repo:${m.repo_id}` : "you", kind: "scope" });
    if (m.superseded_by && ids.has(m.superseded_by)) edges.push({ from: m.id, to: m.superseded_by, kind: "superseded" });
  }
  const count = new Map<string, number>();
  for (const m of items) for (const e of new Set(m.entities)) count.set(e, (count.get(e) ?? 0) + 1);
  const shared = [...count].filter(([, c]) => c >= 2).map(([e]) => e).sort();
  for (const e of shared) nodes.push({ id: `entity:${e}`, type: "entity", label: e, x: 0, y: 0 });
  for (const m of items) for (const e of new Set(m.entities)) if (shared.includes(e)) edges.push({ from: m.id, to: `entity:${e}`, kind: "about" });
  layout(nodes, edges);
  return { nodes, edges, width: W, height: H };
}
