// E9g B (D-377): the same building blocks as apps/web/src/components/ui.tsx (D-305), so the site looks like the app.
export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-display text-sm font-medium tracking-wide text-accent-ink transition hover:brightness-110",
  secondary: "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-panel px-4 py-2 font-display text-sm font-medium tracking-wide text-ink transition hover:bg-raised",
  ghost: "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-mute transition hover:bg-raised hover:text-ink",
} as const;
export const card = "rounded-xl border border-line bg-panel";
export const label = "font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute";
export const link = "text-accent-text underline-offset-4 hover:underline";
