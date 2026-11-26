import type { Key, T } from "../i18n/t";
import type { Tone } from "../lib/status";

// D-305, D-599: the building blocks, in the Harnova brand kit. Colours come from the theme tokens (tokens.css), so dark
// and light are one design. A status is a shape + a word + a colour (never colour alone, WCAG 1.4.1): a diamond waits on
// you, a triangle is the agents working, a tick is proven, a cross failed, a dot is closed.
export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] transition hover:brightness-110 disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-2 rounded-md border border-line-strong bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-raised disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-mute transition hover:bg-raised hover:text-ink",
  danger: "inline-flex items-center justify-center gap-2 rounded-md border border-bad bg-transparent px-4 py-2 text-sm font-medium text-bad transition hover:bg-bad-soft disabled:opacity-50",
} as const;

export const card = "rounded-[10px] border border-line bg-panel";
export const input = "block w-full rounded-md border border-line-strong bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:ring-0";
export const label = "text-xs font-medium text-mute";
export const muted = "text-mute";

export const TONE: Record<Tone, { pill: string; mark: string; text: string }> = {
  gray: { pill: "bg-raised text-mute", mark: "bg-idle", text: "text-mute" },
  blue: { pill: "bg-info-soft text-info", mark: "bg-info animate-pulse", text: "text-info" },
  green: { pill: "bg-ok-soft text-ok", mark: "bg-ok", text: "text-ok" },
  red: { pill: "bg-bad-soft text-bad", mark: "bg-bad", text: "text-bad" },
  amber: { pill: "bg-warn-soft text-warn", mark: "bg-warn", text: "text-warn" },
};

/** D-599: the shape of each tone (globals.css .sig-*). */
export const SIGNAL: Record<Tone, { shape: string }> = {
  amber: { shape: "sig-diamond" },
  blue: { shape: "sig-run" },
  green: { shape: "sig-tick" },
  red: { shape: "sig-cross" },
  gray: { shape: "sig-dot" },
};

export function Hex({ className = "size-2.5", tone }: { className?: string; tone?: Tone }) {
  return <span aria-hidden="true" className={`${tone ? SIGNAL[tone].shape : "sig-diamond"} inline-block shrink-0 ${tone ? TONE[tone].mark : "bg-accent"} ${className}`} />;
}

export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  const t = TONE[tone];
  return (
    <span className={`text-xs font-medium inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 ${t.pill}`}>
      <span aria-hidden="true" className={`${SIGNAL[tone].shape} inline-block size-2.5 ${t.mark}`} />
      {label}
    </span>
  );
}

export function CheckMark({ status, t }: { status: string; t: T }) {
  const m: Record<string, { s: string; c: string; t: Key }> = {
    pass: { s: "✓", c: "bg-ok-soft text-ok", t: "mark.pass" },
    fail: { s: "✕", c: "bg-bad-soft text-bad", t: "mark.fail" },
    unknown: { s: "?", c: "bg-warn-soft text-warn", t: "mark.unknown" },
  };
  const v = m[status] ?? { s: "–", c: "bg-raised text-mute", t: "mark.na" };
  return (
    <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-[3px] text-xs font-bold ${v.c}`} role="img" aria-label={t(v.t)}>
      {v.s}
    </span>
  );
}

/** D-622: a tooltip of the brand — the name, an optional line under it and a key; it shows on hover and on keyboard
 * focus after a short pause, beside a vertical rail (side "right") or under a row (side "bottom", the phone's bar).
 * Screen readers get the name from the control itself, so the tip is aria-hidden. */
export function Tip({ label, hint, keys, side = "right", children }: { label: string; hint?: string | undefined; keys?: string | undefined; side?: "right" | "bottom" | "rail"; children: React.ReactNode }) {
  const at = side === "right" ? "left-full top-1/2 ml-3 -translate-y-1/2" : side === "bottom" ? "left-1/2 top-full mt-2 -translate-x-1/2" : "left-1/2 top-full mt-2 -translate-x-1/2 lg:left-full lg:top-1/2 lg:ml-3 lg:mt-0 lg:translate-x-0 lg:-translate-y-1/2";
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span aria-hidden="true" className={`tip pointer-events-none absolute z-50 w-max max-w-[16rem] rounded-[9px] border border-line-strong bg-raised px-2.5 py-1.5 text-left opacity-0 shadow-[0_8px_24px_rgb(0_0_0/0.35)] transition-[opacity,translate] duration-150 group-hover/tip:opacity-100 group-hover/tip:delay-300 group-has-[:focus-visible]/tip:opacity-100 ${at}`}>
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
          {label}
          {keys && <kbd className="rounded border border-line bg-panel px-1 font-mono text-[10.5px] text-mute">{keys}</kbd>}
        </span>
        {hint && <span className="block text-xs leading-snug text-mute">{hint}</span>}
      </span>
    </span>
  );
}
