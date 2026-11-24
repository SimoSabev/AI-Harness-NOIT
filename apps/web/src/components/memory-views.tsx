import Link from "next/link";
import type { MemoryItem } from "@mandat/contract";
import type { Key, T } from "../i18n/t";
import { KIND_COLOR, clusters, timeLanes } from "../lib/memory-space";

// D-599: two more views of the memory — a timeline (one lane per kind, each memory at its day, bigger the more it was
// used) and clusters (one circle per kind). Every memory is a link that opens it.
export function MemoryTime({ items, href, t }: { items: readonly MemoryItem[]; href: (id: string) => string; t: T }) {
  const lanes = timeLanes(items);
  return (
    <div role="img" aria-label={t("mem.time.label")} className="space-y-1 rounded-[10px] border border-line bg-canvas p-4">
      {lanes.map((l) => (
        <div key={l.kind} className="flex h-14 items-center gap-3 border-b border-line last:border-b-0">
          <span className="flex w-28 shrink-0 items-center gap-2 text-xs text-mute">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: KIND_COLOR[l.kind] }} />{t(`mem.kind.${l.kind}` as Key)}
          </span>
          <div className="relative h-full flex-1">
            {l.items.map((m) => {
              const size = 10 + Math.min(16, m.uses * 1.5);
              return (
                <Link key={m.id} href={href(m.id)} title={m.text} aria-label={m.text} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: `${2 + m.at * 96}%`, width: size, height: size, background: m.status === "pending" ? "transparent" : KIND_COLOR[l.kind], border: m.status === "pending" ? `2px dashed ${KIND_COLOR[l.kind]}` : undefined }} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MemoryClusters({ items, href, t }: { items: readonly MemoryItem[]; href: (id: string) => string; t: T }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 rounded-[10px] border border-line bg-canvas p-6">
      {clusters(items).map((c) => {
        const d = 120 + c.items.length * 22;
        const color = KIND_COLOR[c.kind];
        return (
          <section key={c.kind} aria-label={t(`mem.kind.${c.kind}` as Key)} className="flex flex-col items-center justify-center gap-2 rounded-full p-5" style={{ width: d, height: d, border: `1px solid color-mix(in oklab, ${color} 45%, var(--canvas))`, background: `color-mix(in oklab, ${color} 9%, var(--canvas))` }}>
            <p className="text-xs font-semibold" style={{ color }}>{t(`mem.kind.${c.kind}` as Key)} · {c.items.length}</p>
            <ul className="flex flex-wrap justify-center gap-1.5">
              {c.items.map((m) => (
                <li key={m.id}><Link href={href(m.id)} title={m.text} aria-label={m.text} className="block rounded-full" style={{ width: 12 + Math.min(12, m.uses), height: 12 + Math.min(12, m.uses), background: color }} /></li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
