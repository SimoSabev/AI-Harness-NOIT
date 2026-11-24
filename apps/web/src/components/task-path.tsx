import type { T } from "../i18n/t";
import type { Stop, StopState } from "../lib/task-path";

// D-599: the strap of the brand kit — the five stops of a task on one track, each a ring: done is cyan, running is
// cobalt, waiting on you is a solid amber ring with a halo, failed is coral. One fact under each stop.
const RING: Record<StopState, string> = {
  done: "border-ok text-ok",
  run: "border-info text-info",
  you: "border-warn bg-warn text-canvas shadow-[0_0_0_4px_var(--warn-soft)]",
  fail: "border-bad text-bad",
  todo: "border-line-strong text-faint",
};
const MARK: Record<StopState, string> = { done: "✓", run: "▸", you: "◆", fail: "✕", todo: "" };
const TRACK: Record<StopState, string> = { done: "bg-ok", run: "bg-info", you: "bg-warn", fail: "bg-bad", todo: "bg-line-strong" };

function fact(s: Stop, t: T): string | null {
  if (!s.count) return null;
  if (s.id === "oracle") return t("path.tests", { n: s.count.n });
  if (s.id === "work") return t("path.units", { n: s.count.n, of: s.count.of ?? s.count.n });
  if (s.id === "seal") return t("path.gates", { n: s.count.n });
  return null;
}

export function TaskPath({ stops, t, compact = false }: { stops: Stop[]; t: T; compact?: boolean }) {
  if (compact) {
    return (
      <span role="img" aria-label={stops.map((s) => `${t(s.label)}: ${t(`path.state.${s.state}`)}`).join(", ")} className="inline-flex items-center">
        {stops.map((s, i) => (
          <span key={s.id} className="inline-flex items-center">
            {i > 0 && <span className={`h-0.5 w-2.5 ${stops[i - 1]?.state === "done" ? "bg-ok" : "bg-line-strong"}`} />}
            <span className={`size-2 rounded-full border-2 ${s.state === "you" ? "rotate-45 rounded-[1px] border-warn bg-warn" : s.state === "done" ? "border-ok bg-ok" : RING[s.state]}`} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <ol aria-label={t("path.label")} className="grid grid-cols-5">
      {stops.map((s, i) => (
        <li key={s.id} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={s.state === "you" ? "step" : undefined}>
          <span aria-hidden="true" className={`absolute top-[11px] h-1.5 ${i === 0 ? "left-1/2 right-0 rounded-l-full" : i === stops.length - 1 ? "left-0 right-1/2" : "inset-x-0"} ${TRACK[s.state === "you" || s.state === "fail" ? "done" : s.state]}`} />
          <span className={`relative z-10 flex size-7 items-center justify-center rounded-full border-[3px] bg-canvas text-xs font-semibold ${RING[s.state]}`}>
            <span aria-hidden="true">{MARK[s.state]}</span>
          </span>
          <span className="text-[13px] font-medium leading-tight">{t(s.label)}</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint">
            <span className="sr-only">{t(`path.state.${s.state}`)} · </span>
            {fact(s, t) ?? (s.state === "you" ? t("path.state.you") : "")}
          </span>
        </li>
      ))}
    </ol>
  );
}
