import type { Tone } from "../lib/status";

// D-292: the few building blocks of the UI. Status = dot + word (never colour alone, WCAG 1.4.1).
export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
  secondary: "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  ghost: "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  danger: "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950",
} as const;

export const card = "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
export const input = "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-0 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100";

const TONE: Record<Tone, { pill: string; dot: string }> = {
  gray: { pill: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", dot: "bg-zinc-400" },
  blue: { pill: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300", dot: "bg-sky-500 animate-pulse" },
  green: { pill: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", dot: "bg-emerald-500" },
  red: { pill: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300", dot: "bg-red-500" },
  amber: { pill: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300", dot: "bg-amber-500" },
};

export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${t.pill}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${t.dot}`} />
      {label}
    </span>
  );
}

export function CheckMark({ status }: { status: string }) {
  const m: Record<string, { s: string; c: string; t: string }> = {
    pass: { s: "✓", c: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", t: "мина" },
    fail: { s: "✕", c: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400", t: "не мина" },
    unknown: { s: "?", c: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", t: "неясно" },
  };
  const v = m[status] ?? { s: "–", c: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400", t: "не се прилага" };
  return (
    <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${v.c}`} role="img" aria-label={v.t}>
      {v.s}
    </span>
  );
}
