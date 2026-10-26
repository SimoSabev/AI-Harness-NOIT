import type { MemoryItem } from "@mandat/contract";

// D-392: the "Links" view of the memory menu. Nodes: you, each project, each memory, and every entity two or more
// memories share; edges: scope (memory → you/project), about (memory → entity), superseded (old → new). The layout is radial
// and seeded, so the same memory always draws the same picture — no new dependency.

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

const clampX = (x: number) => Math.min(W - PAD, Math.max(PAD, x));
const clampY = (y: number) => Math.min(H - PAD, Math.max(PAD, y));

/**
 * Radial first, then a gentle push apart: you on the left, the projects on the right, each root's memories on a ring
 * around it, each shared entity between the memories that name it. The push only separates nodes closer than MIN and
 * pulls each back toward its seat, so the picture keeps its shape (who → what) and nothing overlaps.
 */
function layout(nodes: GraphNode[], edges: GraphEdge[]): void {
  const roots = nodes.filter((x) => x.type === "root");
  const seat = new Map<string, { x: number; y: number }>();
  roots.forEach((rt, i) => {
    if (roots.length === 1) seat.set(rt.id, { x: W / 2, y: H / 2 });
    else if (i === 0) seat.set(rt.id, { x: W * 0.3, y: H / 2 });
    else seat.set(rt.id, { x: W * 0.72, y: (H * i) / roots.length });
  });
  const r = rng(42 + nodes.length);
  roots.forEach((rt, ri) => {
    const mine = edges.filter((e) => e.kind === "scope" && e.to === rt.id).map((e) => e.from);
    const c = seat.get(rt.id) ?? { x: W / 2, y: H / 2 };
    // one root: a full ring; you and projects: you fan out to the left, each project to the right (the middle stays
    // free for the entities they share)
    const full = roots.length === 1;
    const radius = Math.min(full ? 300 : 250, 120 + 20 * mine.length);
    const [from, span] = full ? [0, 2 * Math.PI] : ri === 0 ? [Math.PI * 0.55, Math.PI * 0.9] : [-Math.PI * 0.45, Math.PI * 0.9];
    mine.forEach((id, i) => {
      const a = full ? from + (span * i) / Math.max(1, mine.length) + r() * 0.2 : from + (span * (i + 0.5)) / Math.max(1, mine.length);
      seat.set(id, { x: clampX(c.x + radius * Math.cos(a)), y: clampY(c.y + radius * Math.sin(a) * 0.85) });
    });
  });
  for (const en of nodes.filter((x) => x.type === "entity")) {
    const ps = edges.filter((e) => e.kind === "about" && e.to === en.id).flatMap((e) => seat.get(e.from) ?? []);
    const cx = ps.reduce((s, p) => s + p.x, 0) / Math.max(1, ps.length);
    const cy = ps.reduce((s, p) => s + p.y, 0) / Math.max(1, ps.length);
    seat.set(en.id, { x: clampX(cx + (r() - 0.5) * 30), y: clampY(cy + (r() - 0.5) * 30) });
  }
  const pos = nodes.map((x) => ({ ...(seat.get(x.id) ?? { x: W / 2, y: H / 2 }) }));
  const home = pos.map((p) => ({ ...p }));
  const MIN = 46;
  for (let it = 0; it < 160; it++) {
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i]!, b = pos[j]!;
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= MIN) continue;
        if (dist < 0.01) {
          dx = 0.5 + 0.01 * (i - j);
          dy = 0.5;
          dist = Math.hypot(dx, dy);
        }
        const push = (MIN - dist) / 2;
        const fixedA = nodes[i]!.type === "root", fixedB = nodes[j]!.type === "root";
        const wa = fixedA ? 0 : fixedB ? 2 : 1, wb = fixedB ? 0 : fixedA ? 2 : 1;
        a.x = clampX(a.x + (dx / dist) * push * wa); a.y = clampY(a.y + (dy / dist) * push * wa);
        b.x = clampX(b.x - (dx / dist) * push * wb); b.y = clampY(b.y - (dy / dist) * push * wb);
      }
    pos.forEach((p, i) => {
      if (nodes[i]!.type === "root") return;
      p.x += (home[i]!.x - p.x) * 0.02;
      p.y += (home[i]!.y - p.y) * 0.02;
    });
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
