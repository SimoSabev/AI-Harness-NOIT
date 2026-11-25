import type { T } from "../i18n/t";
import type { SealCenter, SealView, Tick } from "../lib/seal-view";

// D-599: the seal of the brand kit — the verdict in the middle, one tick per gate around it.
const TICK: Record<Tick, string> = { pass: "bg-ok", ask: "bg-warn", fail: "bg-bad", na: "bg-line", todo: "bg-line-strong" };
const CENTER: Record<SealCenter, { mark: string; tone: string }> = {
  waiting: { mark: "", tone: "border-line text-mute" },
  checking: { mark: "", tone: "border-info text-info" },
  verified: { mark: "✓", tone: "border-ok text-ok" },
  unknown: { mark: "?", tone: "border-warn text-warn" },
  failed: { mark: "✕", tone: "border-bad text-bad" },
};
const R = 62;

export function SealRing({ view, t }: { view: SealView; t: T }) {
  const c = CENTER[view.center];
  const count = t("seal.count", { n: view.done, of: view.of });
  return (
    <div role="img" aria-label={`${t(`seal.${view.center}`)} · ${count}`} className="relative size-40 shrink-0">
      {view.ticks.map((k, i) => (
        <span key={i} aria-hidden="true" className={`absolute left-1/2 top-1/2 -ml-1 -mt-2.5 h-5 w-2 rounded-[3px] transition-colors ${TICK[k]}`}
          style={{ transform: `rotate(${(i * 360) / Math.max(1, view.ticks.length)}deg) translateY(-${R}px)` }} />
      ))}
      <span aria-hidden="true" className={`absolute inset-[30px] flex flex-col items-center justify-center rounded-full border bg-panel ${c.tone}`}>
        {c.mark ? <span className="text-3xl font-semibold leading-none">{c.mark}</span> : <span className="font-mono text-xl">{view.done}/{view.of}</span>}
        <span className="text-xs font-medium mt-1">{t(`seal.${view.center}`)}</span>
      </span>
    </div>
  );
}
