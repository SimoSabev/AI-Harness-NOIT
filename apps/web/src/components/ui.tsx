import type { Tone } from "../lib/status";

// D-305: the building blocks. Colours come from the theme tokens (globals.css), so dark and light are one design.
// Status = hex mark + word (never colour alone, WCAG 1.4.1).
export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-display text-sm font-medium tracking-wide text-accent-ink transition hover:brightness-110 disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-panel px-4 py-2 font-display text-sm font-medium tracking-wide text-ink transition hover:bg-raised disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-mute transition hover:bg-raised hover:text-ink",
  danger: "inline-flex items-center justify-center gap-2 rounded-lg border border-bad/40 bg-panel px-4 py-2 font-display text-sm font-medium tracking-wide text-bad transition hover:bg-bad-soft disabled:opacity-50",
} as const;

export const card = "rounded-xl border border-line bg-panel";
export const input = "block w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-ink placeholder:text-mute focus:border-accent-text focus:ring-0";
export const label = "font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute";
export const muted = "text-mute";

export const TONE: Record<Tone, { pill: string; mark: string; text: string }> = {
  gray: { pill: "bg-raised text-mute", mark: "bg-idle", text: "text-mute" },
  blue: { pill: "bg-info-soft text-info", mark: "bg-info animate-pulse", text: "text-info" },
  green: { pill: "bg-ok-soft text-ok", mark: "bg-ok", text: "text-ok" },
  red: { pill: "bg-bad-soft text-bad", mark: "bg-bad", text: "text-bad" },
  amber: { pill: "bg-warn-soft text-warn", mark: "bg-warn", text: "text-warn" },
};

export function Hex({ className = "size-2.5", tone }: { className?: string; tone?: Tone }) {
  return <span aria-hidden="true" className={`hex inline-block shrink-0 ${tone ? TONE[tone].mark : "bg-accent"} ${className}`} />;
}

export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${t.pill}`}>
      <span aria-hidden="true" className={`hex inline-block h-2 w-2.5 ${t.mark}`} />
      {label}
    </span>
  );
}

export function CheckMark({ status }: { status: string }) {
  const m: Record<string, { s: string; c: string; t: string }> = {
    pass: { s: "✓", c: "bg-ok-soft text-ok", t: "мина" },
    fail: { s: "✕", c: "bg-bad-soft text-bad", t: "не мина" },
    unknown: { s: "?", c: "bg-warn-soft text-warn", t: "неясно" },
  };
  const v = m[status] ?? { s: "–", c: "bg-raised text-mute", t: "не се прилага" };
  return (
    <span className={`hex inline-flex h-6 w-7 shrink-0 items-center justify-center text-xs font-bold ${v.c}`} role="img" aria-label={v.t}>
      {v.s}
    </span>
  );
}
