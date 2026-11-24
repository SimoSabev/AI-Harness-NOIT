"use client";
import { useEffect, useRef, useState } from "react";
import type { MemoryGraph } from "@mandat/memory";
import { KIND_COLOR, depthOf, project } from "../lib/memory-space";

// D-599: the memory as 3D threads — the 2D map (D-400) lifted into space (depth seeded by each memory's id) and turning
// slowly; near memories are bigger and brighter. Every memory is a link, like on the map. No library: SVG and a frame
// loop; with reduced motion it stands still.
const V = { cx: 500, cy: 350, r: 300 };

export function MemoryThreads({ graph, hrefs, selected, label, youLabel, pauseLabel, playLabel }: { graph: MemoryGraph; hrefs: Record<string, string>; selected: string | null; label: string; youLabel: string; pauseLabel: string; playLabel: string }) {
  const [a, setA] = useState(0.5);
  const [spin, setSpin] = useState(true);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setSpin(false);
  }, []);
  useEffect(() => {
    if (!spin) return;
    let last = performance.now();
    const tick = (now: number) => {
      setA((x) => x + (now - last) * 0.00018);
      last = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [spin]);
  const pos = new Map(graph.nodes.map((n) => {
    const p3 = { x: (n.x - graph.width / 2) / (graph.width / 2.2), y: (n.y - graph.height / 2) / (graph.height / 1.6), z: n.type === "root" ? 0 : depthOf(n.id) * 0.85 };
    return [n.id, project(p3, a, V)] as const;
  }));
  const near = new Set(selected ? graph.edges.flatMap((e) => (e.from === selected ? [e.to] : e.to === selected ? [e.from] : [])) : []);
  const order = [...graph.nodes].sort((x, y) => (pos.get(y.id)?.z ?? 0) - (pos.get(x.id)?.z ?? 0));
  return (
    <div className="relative">
      <svg viewBox="0 0 1000 700" role="img" aria-label={label} className="h-auto w-full rounded-[10px] border border-line bg-canvas">
        {graph.edges.map((e, i) => {
          const p = pos.get(e.from);
          const q = pos.get(e.to);
          if (!p || !q) return null;
          const on = selected !== null && (e.from === selected || e.to === selected);
          const depth = Math.max(0.12, Math.min(0.7, 0.45 - (p.z + q.z) * 0.25));
          return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={on ? 2 : 1} strokeDasharray={e.kind === "superseded" ? "5 4" : undefined} stroke={on ? "var(--accent-text)" : "var(--mute)"} opacity={on ? 1 : depth} />;
        })}
        {order.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const fade = Math.max(0.35, Math.min(1, 0.85 - p.z * 0.35));
          if (n.type === "root") {
            return (
              <g key={n.id}>
                <circle cx={p.x} cy={p.y} r={16 * p.s} fill="var(--raised)" stroke="var(--accent)" strokeWidth={2} />
                <text x={p.x} y={p.y + 34 * p.s} textAnchor="middle" className="fill-ink text-[15px] font-semibold">{n.id === "you" ? youLabel : n.label}</text>
              </g>
            );
          }
          if (n.type === "entity") return <rect key={n.id} x={p.x - 4 * p.s} y={p.y - 4 * p.s} width={8 * p.s} height={8 * p.s} rx={2} fill={near.has(n.id) ? "var(--info)" : "var(--line-strong)"} opacity={fade} />;
          const on = n.id === selected;
          const c = KIND_COLOR[n.kind ?? "note"];
          const pending = n.status === "pending";
          return (
            <a key={n.id} href={hrefs[n.id] ?? "#"} aria-label={n.label}>
              <title>{n.label}</title>
              <circle cx={p.x} cy={p.y} r={(on ? 12 : 8) * p.s} fill={pending ? "none" : c} stroke={pending ? c : on ? "var(--ink)" : "none"} strokeWidth={2} strokeDasharray={pending ? "3 2" : undefined} opacity={fade} />
              {(on || near.has(n.id)) && <text x={p.x + 14} y={p.y + 5} className="fill-ink text-[14px]">{n.label.length > 40 ? `${n.label.slice(0, 39)}…` : n.label}</text>}
            </a>
          );
        })}
      </svg>
      <button type="button" onClick={() => setSpin((s) => !s)} className="absolute right-3 top-3 rounded-md border border-line-strong bg-panel px-3 py-1.5 text-xs font-medium text-ink hover:bg-raised">{spin ? pauseLabel : playLabel}</button>
    </div>
  );
}
