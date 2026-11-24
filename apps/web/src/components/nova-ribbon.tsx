import type { T } from "../i18n/t";
import type { NovaPhase, NovaState } from "../lib/nova-line";

// D-599: Nova on screen — the four-point star of the mark (no glowing orb; the rays carry the state) and one line that
// says what she does now. Opened, the card lists her last steps (✓ done, ▸ now) and the last lines of the conversation.
const STAR = "M32 4C34 24 40 30 60 32C40 34 34 40 32 60C30 40 24 34 4 32C24 30 30 24 32 4Z";

export function NovaStar({ phase, className = "size-7" }: { phase: NovaPhase; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" data-phase={phase} className={`nova-star shrink-0 ${phase === "error" ? "text-bad" : "text-accent"} ${className}`}>
      <path d={STAR} fill="currentColor" />
    </svg>
  );
}

export function NovaRibbon({ state, t, open, onToggle, live, onStar }: { state: NovaState; t: T; open: boolean; onToggle: () => void; live: boolean; onStar: () => void }) {
  const line = state.line ? t(state.line.key, state.line.params) : t("voice.talk");
  return (
    <div className="flex flex-col items-end gap-2">
      {open && (state.steps.length > 0 || state.lines.length > 0) && (
        <section aria-label={t("nova.timeline")} className="w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[14px] border border-line-strong bg-panel shadow-[0_12px_32px_rgb(0_0_0/0.35)]">
          <p className="border-b border-line px-3.5 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-mute">{t("nova.timeline")}</p>
          {state.steps.length > 0 && (
            <ol className="space-y-1.5 border-b border-line px-3.5 py-2.5 text-[13px]">
              {state.steps.map((s, i) => (
                <li key={`${s.at}-${i}`} className="flex gap-2">
                  <span aria-hidden="true" className={`w-3.5 ${s.done ? "text-ok" : "text-accent-text"}`}>{s.done ? "✓" : "▸"}</span>
                  <span className={`min-w-0 flex-1 ${s.done ? "text-mute" : "text-ink"}`}>{t(s.key, s.params)}</span>
                  {!s.done && <span className="font-mono text-[11px] text-faint">{t("nova.now")}</span>}
                </li>
              ))}
            </ol>
          )}
          {state.lines.length > 0 && (
            <div className="space-y-1 px-3.5 py-2.5 text-[13px] leading-snug">
              {state.lines.map((l, i) => (
                <p key={i}><span className={l.who === "you" ? "text-mute" : "text-accent-text"}>{l.who === "you" ? t("nova.you") : "Nova"}:</span> {l.text}</p>
              ))}
            </div>
          )}
        </section>
      )}
      <div className={`flex max-w-[26rem] items-center gap-3 rounded-full border bg-panel py-1.5 pl-2 pr-4 shadow-[0_12px_32px_rgb(0_0_0/0.35)] ${state.phase === "error" ? "border-bad" : "border-line-strong"}`}>
        <button type="button" onClick={onStar} aria-pressed={live} aria-label={live ? t("voice.stop") : t("voice.talk")} className="rounded-full p-0.5 transition hover:bg-raised">
          <NovaStar phase={state.phase} />
        </button>
        <button type="button" onClick={live || state.steps.length > 0 ? onToggle : onStar} aria-expanded={open} className="flex min-w-0 flex-col items-start text-left">
          <span className={`font-mono text-[10px] uppercase leading-tight tracking-[0.08em] ${state.phase === "error" ? "text-bad" : "text-accent-text"}`}>{t(`nova.kind.${state.phase}`)}</span>
          <span className="max-w-[18rem] truncate text-[13.5px] leading-snug text-ink" aria-live="polite">{line}</span>
        </button>
      </div>
    </div>
  );
}
