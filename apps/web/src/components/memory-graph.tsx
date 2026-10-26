import Link from "next/link";
import type { MemoryGraph } from "@mandat/memory";

// D-400: the "Links" view — the seeded layout of @mandat/memory drawn as SVG on the server (no client script). Memories are
// dots (by status), what they are about are squares, you and your projects are hexagons; each memory opens on click.
const DOT: Record<string, string> = { active: "fill-accent", pending: "fill-warn", invalid: "fill-idle", archived: "fill-idle", rejected: "fill-idle" };
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const hex = (x: number, y: number, r: number) => Array.from({ length: 6 }, (_, i) => `${x + r * Math.cos((Math.PI / 3) * i)},${y + r * Math.sin((Math.PI / 3) * i)}`).join(" ");

export function MemoryGraphView({ graph, selected, href, youLabel, label }: { graph: MemoryGraph; selected: string | null; href: (id: string) => string; youLabel: string; label: string }) {
  const pos = new Map(graph.nodes.map((n) => [n.id, n]));
  const near = new Set(selected ? graph.edges.flatMap((e) => (e.from === selected ? [e.to] : e.to === selected ? [e.from] : [])) : []);
  const many = graph.nodes.filter((n) => n.type === "memory").length > 30;
  // a memory's label points away from its root (you or the project), so the labels fan out instead of crossing
  const rootOf = new Map(graph.edges.filter((e) => e.kind === "scope").map((e) => [e.from, pos.get(e.to)]));
  const left = (id: string, x: number) => x > graph.width - 230 || (x >= 230 && x < (rootOf.get(id)?.x ?? graph.width / 2));
  return (
    <svg viewBox={`0 0 ${graph.width} ${graph.height}`} role="img" aria-label={label} className="h-auto w-full rounded-xl border border-line bg-canvas">
      <g>
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const on = selected !== null && (e.from === selected || e.to === selected);
          return (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={on ? 2 : 1} strokeDasharray={e.kind === "superseded" ? "5 4" : e.kind === "scope" ? "1 3" : undefined}
              className={on ? "stroke-accent-text" : "stroke-mute opacity-40"} />
          );
        })}
      </g>
      {graph.nodes.map((n) => {
        const on = n.id === selected;
        const text = n.type === "root" && n.id === "you" ? youLabel : n.label;
        if (n.type === "memory") {
          return (
            <Link key={n.id} href={href(n.id)} aria-label={n.label}>
              <title>{n.label}</title>
              <circle cx={n.x} cy={n.y} r={on ? 11 : 8} className={`${DOT[n.status ?? "active"]} ${on ? "stroke-ink" : "stroke-canvas"}`} strokeWidth={2} />
              {(on || near.has(n.id) || !many) && (
                <text x={left(n.id, n.x) ? n.x - 13 : n.x + 13} y={n.y + 5} textAnchor={left(n.id, n.x) ? "end" : "start"} className="fill-ink text-[15px]">{short(n.label, on ? 60 : 26)}</text>
              )}
            </Link>
          );
        }
        if (n.type === "entity") {
          return (
            <g key={n.id}>
              <rect x={n.x - 6} y={n.y - 6} width={12} height={12} rx={2} className={near.has(n.id) ? "fill-info" : "fill-raised stroke-line-strong"} />
              <text x={n.x + 10} y={n.y + 4} className="fill-mute font-mono text-[14px]">{short(text, 24)}</text>
            </g>
          );
        }
        return (
          <g key={n.id}>
            <polygon points={hex(n.x, n.y, 16)} className="fill-accent-soft stroke-accent-text" strokeWidth={2} />
            <text x={n.x} y={n.y + 32} textAnchor="middle" className="fill-ink font-display text-[16px] font-semibold">{short(text, 28)}</text>
          </g>
        );
      })}
    </svg>
  );
}
