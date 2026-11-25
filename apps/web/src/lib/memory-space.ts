import type { MemoryItem, MemoryKind } from "@mandat/contract";

// D-599: the memory in space and time, pure. Each kind has its own colour (the brand kit's data colours); the depth of a
// memory in the 3D threads is seeded by its id, so the same memories always draw the same picture; the projection turns
// the cloud around its vertical axis with a little perspective. The timeline puts each memory at its day; clusters
// group by kind.
export const KIND_COLOR: Record<MemoryKind, string> = {
  preference: "#b4a3ff", convention: "#3fc7d8", command: "#6aa8f0", pitfall: "#f08a6b", fact: "#7fd19b", note: "#9fb1b9", episode: "#e7b04f",
};
const KINDS = Object.keys(KIND_COLOR) as MemoryKind[];

/** a stable depth in [-1, 1] from an id (FNV-1a) */
export function depthOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return (h / 0xffffffff) * 2 - 1;
}

export interface P3 { x: number; y: number; z: number }
/** turn around the vertical axis by `a`, tilt a little, and put it on the screen; `s` is the scale of what is far (<1) or near (>1) */
export function project(p: P3, a: number, v: { cx: number; cy: number; r: number }): { x: number; y: number; s: number; z: number } {
  const x1 = p.x * Math.cos(a) + p.z * Math.sin(a);
  const z1 = -p.x * Math.sin(a) + p.z * Math.cos(a);
  const tilt = 0.32;
  const y1 = p.y * Math.cos(tilt) - z1 * Math.sin(tilt);
  const z2 = p.y * Math.sin(tilt) + z1 * Math.cos(tilt);
  const s = 3 / (3 + z2);
  return { x: v.cx + x1 * v.r * s, y: v.cy + y1 * v.r * s, s, z: z2 };
}

export interface Lane { kind: MemoryKind; items: { id: string; text: string; at: number; uses: number; status: MemoryItem["status"] }[] }
/** one lane per kind present (in the catalogue order), each memory at 0…1 between the first and the last day */
export function timeLanes(items: readonly MemoryItem[]): Lane[] {
  const ts = items.map((m) => Date.parse(m.created_at));
  const lo = Math.min(...ts);
  const span = Math.max(1, Math.max(...ts) - lo);
  return KINDS.flatMap((kind) => {
    const of = items.filter((m) => m.kind === kind);
    return of.length === 0 ? [] : [{ kind, items: of.map((m) => ({ id: m.id, text: m.text, at: (Date.parse(m.created_at) - lo) / span, uses: m.uses, status: m.status })) }];
  });
}

/** clusters by kind, the biggest first (ties in the catalogue order) */
export function clusters(items: readonly MemoryItem[]): { kind: MemoryKind; items: MemoryItem[] }[] {
  return KINDS.map((kind) => ({ kind, items: items.filter((m) => m.kind === kind) }))
    .filter((c) => c.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length);
}
